/** LCS diff tests: optimality, boundaries, unified headers, side-by-side. */
import assert from 'node:assert/strict'
import { diffLines, unified, sideBySide, stats } from '../lib/lcs.js'

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

const types = (ops) => ops.map((o) => o.type)

test('identical texts → all equal', () => {
  const ops = diffLines('a\nb\nc', 'a\nb\nc')
  assert.deepEqual(types(ops), ['equal', 'equal', 'equal'])
  assert.deepEqual(ops.map((o) => o.aLine), [1, 2, 3])
  assert.deepEqual(ops.map((o) => o.bLine), [1, 2, 3])
})

test('pure addition appends inserts with right-side line numbers', () => {
  const ops = diffLines('a\nb', 'a\nb\nc\nd')
  assert.deepEqual(types(ops), ['equal', 'equal', 'insert', 'insert'])
  assert.deepEqual(ops[2], { type: 'insert', aLine: null, bLine: 3, text: 'c' })
})

test('pure deletion', () => {
  const ops = diffLines('a\nb\nc', 'a')
  assert.deepEqual(types(ops), ['equal', 'delete', 'delete'])
  assert.deepEqual(ops[1], { type: 'delete', aLine: 2, bLine: null, text: 'b' })
})

test('middle change pairs delete+insert (LCS keeps shared lines)', () => {
  const ops = diffLines('a\nold\nc', 'a\nnew\nc')
  assert.deepEqual(types(ops), ['equal', 'delete', 'insert', 'equal'])
  assert.equal(ops[1].text, 'old')
  assert.equal(ops[2].text, 'new')
  assert.equal(ops[1].aLine, 2)
  assert.equal(ops[2].bLine, 2)
})

test('empty vs non-empty: empty string counts as ONE empty line', () => {
  assert.deepEqual(types(diffLines('', 'x\ny')), ['delete', 'insert', 'insert'])
  assert.equal(diffLines('', 'x\ny')[0].text, '')
  assert.deepEqual(types(diffLines('x\ny', '')), ['delete', 'delete', 'insert'])
  assert.equal(diffLines('x\ny', '')[2].text, '')
  // '' 与 '' = 一行空行,相等
  assert.deepEqual(diffLines('', ''), [{ type: 'equal', aLine: 1, bLine: 1, text: '' }])
})

test('LCS is optimal: skips matching lines instead of naive pairing', () => {
  // Optimal: 'x' in b matches a's x; a naive index-wise diff would see all-changed.
  const ops = diffLines('x\na\nb', 'a\nb\nx')
  assert.deepEqual(types(ops), ['delete', 'equal', 'equal', 'insert'])
  assert.equal(ops[0].text, 'x')
})

test('stats counts insertions/deletions', () => {
  const s = stats(diffLines('a\nb\nc', 'a\nB\nc\nd'))
  assert.deepEqual(s, { equal: 2, deletions: 1, insertions: 2, changed: 3 }, 'b→B 删+插,d 再插一行')
})

test('unified headers carry correct counts and ranges', () => {
  const ops = diffLines('l1\nl2\nl3\nl4\nl5\nCHANGED\nl7\nl8\nl9\nl10\nl11', 'l1\nl2\nl3\nl4\nl5\nchanged\nl7\nl8\nl9\nl10\nl11')
  const text = unified(ops, 3)
  const header = text.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
  assert.ok(header, '必须输出 @@ 头')
  assert.equal(+header[1], 3, '块首索引 2 → aLine 3(context 3 行)')
  assert.equal(+header[2], 7, 'a 行数 = 3 上下文 + 1 删除')
  assert.equal(+header[3], 3)
  assert.equal(+header[4], 7)
  assert.match(text, /-CHANGED/)
  assert.match(text, /\+changed/)
})

test('unified with default context trims far-apart changes into two hunks', () => {
  const a = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join('\n')
  const bLines = a.split('\n')
  bLines[2] = 'CH2'; bLines[25] = 'CH26'
  const ops = diffLines(a, bLines.join('\n'))
  const text = unified(ops, 3)
  const headers = [...text.matchAll(/@@ -\d+,\d+ \+\d+,\d+ @@/g)]
  assert.equal(headers.length, 2, '相距很远的两处修改应拆成两个 hunk')
})

test('unified returns empty string for identical inputs', () => {
  assert.equal(unified(diffLines('a\nb', 'a\nb')), '')
})

test('sideBySide pairs delete+insert rows and pads gaps', () => {
  const ops = diffLines('keep\nold\nkeep2', 'keep\nnew\nnew2\nkeep2')
  const rows = sideBySide(ops)
  const del = rows.filter((r) => r.left?.type === 'delete')
  const ins = rows.filter((r) => r.right?.type === 'insert')
  assert.equal(del.length, 1)
  assert.equal(ins.length, 2, 'old 删一行,new/new2 两行插入')
  assert.equal(rows[0].left.text, 'keep')
  assert.equal(rows[0].right.text, 'keep')
  assert.equal(rows[rows.length - 1].left.text, 'keep2')
})

test('huge input degrades via fallback without hanging', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n')
  const b = a.replace('line 1500', 'CHANGED') + '\ntail'
  const ops = diffLines(a, b) // 3000*3001 > 4e6 → fallback path
  assert.equal(stats(ops).equal >= 2998, true)
  assert.equal(stats(ops).changed >= 2, true, '降级模式仍能定位变化')
})

test('no trailing-newline phantom: text without final \\n has exact lines', () => {
  const ops = diffLines('a\nb', 'a\nb')
  assert.equal(ops.length, 2)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
