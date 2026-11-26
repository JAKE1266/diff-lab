#!/usr/bin/env node
/**
 * diff-lab CLI — zero-dependency line & JSON diff.
 *
 *   diff-lab <fileA> <fileB> [选项]
 *     --mode lines|json   lines(默认)按行 LCS;json 解析两文件做语义 diff
 *     --context N         统一 diff 上下文行数(默认 3)
 *     --side              额外输出并排(JSON)视图数据
 *     --json              输出 JSON 而不是文本
 *     --out FILE          写入文件
 *
 * 退出码:有差异 1,完全一致 0(CI 友好)。
 */
import fs from 'node:fs'
import { diffLines, unified, sideBySide, stats } from './lib/lcs.js'
import { jsonDiffText, jsonDiffReport, jsonDiff } from './lib/json-diff.js'

function usage() {
  return [
    'diff-lab — 零依赖结构化 diff',
    '',
    '用法:',
    '  diff-lab <fileA> <fileB> [选项]',
    '',
    '选项:',
    '  --mode lines|json   lines(默认)按行 LCS;json 做语义 diff',
    '  --context N         统一 diff 上下文行数(默认 3)',
    '  --side              附加并排视图数据(JSON)',
    '  --json              输出 JSON 而不是文本',
    '  --out FILE          写入文件',
    '',
    '退出码:有差异 1,完全一致 0。',
  ].join('\n')
}

function parseArgv(argv) {
  const pos = []
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++ }
      else opts[key] = true
    } else pos.push(a)
  }
  return { pos, opts }
}

const read = (file) => {
  if (!file || !fs.existsSync(file)) throw new Error(`文件不存在: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

export async function main(argv = process.argv.slice(2)) {
  const { pos, opts } = parseArgv(argv)
  if (pos.length < 2 || opts.help) { console.log(usage()); return pos.length < 2 && !opts.help ? 1 : 0 }

  const fileA = pos[0]
  const fileB = pos[1]
  const mode = opts.mode === 'json' ? 'json' : 'lines'
  const context = opts.context !== undefined && opts.context !== '' ? Number(opts.context) : 3

  let payload
  let hasDiff
  if (mode === 'json') {
    const ops = jsonDiffText(read(fileA), read(fileB))
    hasDiff = ops.length > 0
    payload = { mode, fileA, fileB, ops, report: jsonDiffReport(ops) }
    if (opts.side) payload.side = null // JSON 模式天然是路径表,无并排概念
  } else {
    const ops = diffLines(read(fileA), read(fileB))
    const s = stats(ops)
    hasDiff = s.changed > 0
    const unifiedText = unified(ops, context)
    payload = {
      mode, fileA, fileB, ops,
      stats: s,
      report: hasDiff
        ? `--- ${fileA}\n+++ ${fileB}\n${unifiedText}`
        : '✓ 两个文件完全一致',
    }
    if (opts.side) payload.side = sideBySide(ops)
  }

  if (opts.json) {
    const out = opts.side ? payload : { ...payload, ops: payload.ops, report: undefined }
    const text = JSON.stringify(out, null, 2)
    if (opts.out) fs.writeFileSync(opts.out, text + '\n', 'utf8')
    else console.log(text)
  } else {
    if (opts.out) fs.writeFileSync(opts.out, payload.report + '\n', 'utf8')
    else console.log(payload.report)
  }
  return hasDiff ? 1 : 0
}

if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  main().then(
    (code) => { process.exitCode = code },
    (e) => { console.error(`错误: ${e.message}`); process.exitCode = 1 },
  )
}
