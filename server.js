/**
 * diff-lab server — zero dependency. POST /api/diff + single-file dashboard.
 *
 *   node server.js            → http://127.0.0.1:8798
 *   PORT=9000 node server.js
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffLines, unified, sideBySide, stats } from './lib/lcs.js'
import { jsonDiffText, jsonDiffReport } from './lib/json-diff.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 8798

const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}
const readBody = (req, limit = 2e6) => new Promise((resolve, reject) => {
  let buf = ''
  req.on('data', (c) => { buf += c; if (buf.length > limit) reject(new Error('body too large')) })
  req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new Error('invalid JSON')) } })
  req.on('error', reject)
})

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (u.pathname === '/api/diff' && req.method === 'POST') {
      const body = await readBody(req)
      const mode = body.mode === 'json' ? 'json' : 'lines'
      const context = Number.isFinite(Number(body.context)) ? Number(body.context) : 3
      if (typeof body.a !== 'string' || typeof body.b !== 'string') {
        return json(res, 400, { error: '需要 a 与 b 两个字符串字段' })
      }
      if (mode === 'json') {
        try {
          const ops = jsonDiffText(body.a, body.b)
          return json(res, 200, { mode, ops, report: jsonDiffReport(ops), hasDiff: ops.length > 0 })
        } catch (e) {
          return json(res, 400, { error: e.message })
        }
      }
      const ops = diffLines(body.a, body.b)
      const s = stats(ops)
      const hasDiff = s.changed > 0
      return json(res, 200, {
        mode, ops, stats: s,
        report: hasDiff ? unified(ops, context) : '',
        side: sideBySide(ops),
        hasDiff,
      })
    }
    if (u.pathname === '/' && req.method === 'GET') {
      const p = path.join(__dirname, 'public', 'index.html')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fs.readFileSync(p))
    }
    return json(res, 404, { error: 'Not found' })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`diff-lab → http://127.0.0.1:${PORT}`)
})
process.on('SIGINT', () => { server.close(); process.exit(0) })
