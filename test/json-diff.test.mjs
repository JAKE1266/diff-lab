/** JSON semantic diff tests: paths, add/remove/change, arrays, type changes. */
import assert from 'node:assert/strict'
import { jsonDiff, jsonDiffText, jsonDiffReport } from '../lib/json-diff.js'

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

test('identical values → empty diff (deep equality)', () => {
  assert.deepEqual(jsonDiff({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }), [])
  assert.deepEqual(jsonDiff(null, null), [])
  assert.deepEqual(jsonDiff('x', 'x'), [])
})

test('top-level scalar change uses $ path', () => {
  const d = jsonDiff(1, 2)
  assert.deepEqual(d, [{ path: '$', type: 'change', a: 1, b: 2 }])
})

test('object key add/remove/change with sorted paths', () => {
  const d = jsonDiff(
    { name: 'old', gone: 1, keep: true },
    { name: 'new', added: 2, keep: true },
  )
  assert.deepEqual(d.map((x) => [x.path, x.type]), [
    ['$.added', 'add'],
    ['$.gone', 'remove'],
    ['$.name', 'change'],
  ])
  assert.equal(d[2].a, 'old')
  assert.equal(d[2].b, 'new')
})

test('nested objects compose paths', () => {
  const d = jsonDiff(
    { user: { profile: { age: 20, city: 'BJ' } } },
    { user: { profile: { age: 21, city: 'BJ' } } },
  )
  assert.deepEqual(d, [{ path: '$.user.profile.age', type: 'change', a: 20, b: 21 }])
})

test('arrays compare index-wise with [i] paths', () => {
  const d = jsonDiff(
    { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    { items: [{ id: 1 }, { id: 9 }] },
  )
  assert.deepEqual(d, [
    { path: '$.items[1].id', type: 'change', a: 2, b: 9 },
    { path: '$.items[2]', type: 'remove', a: { id: 3 } },
  ])
})

test('array tail add', () => {
  const d = jsonDiff({ list: [1] }, { list: [1, 2] })
  assert.deepEqual(d, [{ path: '$.list[1]', type: 'add', b: 2 }])
})

test('type change (object → scalar) is a single change', () => {
  const d = jsonDiff({ a: { deep: 1 } }, { a: 'scalar' })
  assert.deepEqual(d, [{ path: '$.a', type: 'change', a: { deep: 1 }, b: 'scalar' }])
})

test('array ↔ object type change is one change on the path', () => {
  const d = jsonDiff({ a: [1, 2] }, { a: { 0: 1 } })
  assert.deepEqual(d.map((x) => x.type), ['change'])
})

test('jsonDiffText parses and reports 中文 errors on bad JSON', () => {
  const d = jsonDiffText('{"a":1}', '{"a":2}')
  assert.equal(d.length, 1)
  assert.throws(() => jsonDiffText('{oops', '{}'), /左侧/)
  assert.throws(() => jsonDiffText('{}', 'nope'), /右侧/)
})

test('jsonDiffReport renders + / - / ~ lines with a summary head', () => {
  const report = jsonDiffReport(jsonDiff({ a: 1, b: 2, c: 3 }, { a: 9, c: 3, d: 4 }))
  assert.match(report, /^JSON 差异:3 处\(\+1 增 \/ -1 删 \/ ~1 改\)/)
  assert.match(report, /\+ \$.d = 4/)
  assert.match(report, /- \$.b \(原 2\)/)
  assert.match(report, /~ \$.a: 1 → 9/)
  assert.match(jsonDiffReport([]), /完全一致/)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
