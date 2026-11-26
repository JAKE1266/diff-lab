/**
 * E2E: CLI (against temp fixture files, exit codes, --json, --side) and the
 * HTTP server (POST /api/diff lines + json modes, dashboard).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let n = 0
const pending = []
const test = (name, fn) => {
  pending.push(async () => {
    try { await fn(); console.log(`ok   ${name}`); n++ }
    catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
  })
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-lab-e2e-'))
const A = path.join(dir, 'a.txt')
const B = path.join(dir, 'b.txt')
fs.writeFileSync(A, 'alpha\nbeta\ngamma\n', 'utf8')
fs.writeFileSync(B, 'alpha\nBETA\ngamma\ndelta\n', 'utf8')
const SAME = path.join(dir, 'same.txt')
fs.writeFileSync(SAME, 'alpha\nbeta\ngamma\n', 'utf8')

// ---- CLI (spawnSync fine here: no upstream server in this process) ----
const runCli = (args) => spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), ...args], { encoding: 'utf8' })

test('CLI 行级模式:文本报告 + exit 1', () => {
  const r = runCli([A, B])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /--- .*a\.txt/)
  assert.match(r.stdout, /\+\+\+ .*b\.txt/)
  assert.match(r.stdout, /-beta/)
  assert.match(r.stdout, /\+BETA/)
  assert.match(r.stdout, /\+delta/)
})

test('CLI 完全一致 → exit 0', () => {
  const r = runCli([A, SAME])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /完全一致/)
})

test('CLI --json 输出 ops 与 stats', () => {
  const r = runCli([A, B, '--json'])
  assert.equal(r.status, 1)
  const data = JSON.parse(r.stdout)
  assert.equal(data.mode, 'lines')
  assert.equal(data.stats.insertions, 2, 'BETA + delta')
  assert.equal(data.stats.deletions, 1)
  assert.ok(data.ops.length >= 4)
})

test('CLI --side 附带并排数据', () => {
  const r = runCli([A, B, '--json', '--side'])
  const data = JSON.parse(r.stdout)
  assert.ok(Array.isArray(data.side))
  const leftDel = data.side.find((row) => row.left?.type === 'delete')
  assert.equal(leftDel.left.text, 'beta')
})

test('CLI JSON 模式:语义 diff 路径 + exit 1', () => {
  const ja = path.join(dir, 'a.json')
  const jb = path.join(dir, 'b.json')
  fs.writeFileSync(ja, '{"name":"old","items":[1,2]}', 'utf8')
  fs.writeFileSync(jb, '{"name":"new","items":[1,2,3]}', 'utf8')
  const r = runCli([ja, jb, '--mode', 'json'])
  assert.equal(r.status, 1)
  assert.match(r.stdout, /JSON 差异:2 处/)
  assert.match(r.stdout, /\+ \$\.items\[2\] = 3/)
  assert.match(r.stdout, /~ \$\.name: "old" → "new"/)
})

test('CLI JSON 模式坏 JSON 报中文错误', () => {
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, '{oops', 'utf8')
  const r = runCli([bad, A, '--mode', 'json'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /左侧不是合法 JSON/)
})

test('CLI --out 写入报告文件', () => {
  const out = path.join(dir, 'report.txt')
  const r = runCli([A, B, '--out', out])
  assert.equal(r.status, 1)
  assert.match(fs.readFileSync(out, 'utf8'), /-beta/)
})

// ---- server E2E ----
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)) })
  })
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

test('server:POST /api/diff 行级 + JSON 模式 + 仪表盘', async () => {
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const logs = []
  child.stdout.on('data', (d) => logs.push(d.toString()))
  child.stderr.on('data', (d) => logs.push(d.toString()))
  try {
    let up = false
    for (let i = 0; i < 40 && !up; i++) {
      try { up = (await fetch(`${base}/api/diff`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":"1","b":"1"}' })).ok } catch { await sleep(250) }
    }
    if (!up) throw new Error('服务器未启动: ' + logs.join('').slice(-400))

    const lines = await (await fetch(`${base}/api/diff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 'a\nb', b: 'a\nc', mode: 'lines', context: 1 }),
    })).json()
    assert.equal(lines.mode, 'lines')
    assert.equal(lines.hasDiff, true)
    assert.equal(lines.stats.deletions, 1)
    assert.equal(lines.stats.insertions, 1)
    assert.match(lines.report, /-b/)
    assert.match(lines.report, /\+c/)
    assert.ok(Array.isArray(lines.side))

    const jsonMode = await (await fetch(`${base}/api/diff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: '{"x":1}', b: '{"x":2}', mode: 'json' }),
    })).json()
    assert.equal(jsonMode.mode, 'json')
    assert.deepEqual(jsonMode.ops, [{ path: '$.x', type: 'change', a: 1, b: 2 }])
    assert.match(jsonMode.report, /~ \$\.x: 1 → 2/)

    const dash = await fetch(`${base}/`)
    assert.equal(dash.status, 200)
    assert.match(await dash.text(), /diff-lab/)

    const bad = await fetch(`${base}/api/diff`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: '{oops', b: '{}', mode: 'json' }),
    })
    assert.equal(bad.status, 400)
    assert.match((await bad.json()).error, /左侧/)
  } finally {
    killTree(child)
    await sleep(400)
  }
})

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

for (const p of pending) await p()
fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
