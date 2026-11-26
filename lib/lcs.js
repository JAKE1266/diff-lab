/**
 * Line-level diff via LCS (longest common subsequence). Zero dependencies.
 *
 * - diffLines(a, b) → per-line ops [{ type: 'equal'|'insert'|'delete',
 *   aLine, bLine, text }] (1-based line numbers, null on the missing side).
 * - unified(ops, context) → classic unified-diff text with @@ headers.
 * - sideBySide(ops) → row pairs for two-column UIs.
 *
 * Complexity guard: the LCS table is O(n·m). Beyond DIFF_CELL_LIMIT cells the
 * algorithm degrades to prefix/suffix trimming + index-wise pairing — slower
 * diffs lose optimality but never crash or hang (documented trade-off).
 */

const DIFF_CELL_LIMIT = 4_000_000

export function diffLines(aText, bText) {
  const a = String(aText ?? '').split('\n')
  const b = String(bText ?? '').split('\n')
  if (a.length * b.length > DIFF_CELL_LIMIT) return fallbackDiff(a, b)

  const n = a.length
  const m = b.length
  const w = m + 1
  // dp[i*w+j] = LCS length of a[i..] and b[j..]
  const dp = new Int32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'equal', aLine: i + 1, bLine: j + 1, text: a[i] })
      i++; j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      ops.push({ type: 'delete', aLine: i + 1, bLine: null, text: a[i] })
      i++
    } else {
      ops.push({ type: 'insert', aLine: null, bLine: j + 1, text: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'delete', aLine: i + 1, bLine: null, text: a[i++] })
  while (j < m) ops.push({ type: 'insert', aLine: null, bLine: j + 1, text: b[j++] })
  return ops
}

/** Degraded mode for huge inputs: trim common prefix/suffix, pair the rest. */
function fallbackDiff(a, b) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const ops = []
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', aLine: i + 1, bLine: i + 1, text: a[i] })
  const midA = endA - start
  const midB = endB - start
  const midLen = Math.max(midA, midB)
  for (let k = 0; k < midLen; k++) {
    const ai = start + k
    const bi = start + k
    if (k < midA && k < midB && a[ai] === b[bi]) {
      ops.push({ type: 'equal', aLine: ai + 1, bLine: bi + 1, text: a[ai] })
    } else {
      if (k < midA) ops.push({ type: 'delete', aLine: ai + 1, bLine: null, text: a[ai] })
      if (k < midB) ops.push({ type: 'insert', aLine: null, bLine: bi + 1, text: b[bi] })
    }
  }
  return ops
}

/** Mark which ops are changes (non-equal). */
const changedFlags = (ops) => ops.map((o) => o.type !== 'equal')

/**
 * Unified diff text with @@ -a,count +b,count @@ headers.
 * @param {Array} ops — diffLines output
 * @param {number} context — unchanged lines kept around each change (default 3)
 */
export function unified(ops, context = 3) {
  const changed = changedFlags(ops)
  const idx = []
  for (let i = 0; i < ops.length; i++) if (changed[i]) idx.push(i)
  if (!idx.length) return ''

  // Group changed indices into hunks: gaps larger than 2*context split hunks.
  const hunks = []
  let group = [idx[0]]
  for (let k = 1; k < idx.length; k++) {
    if (idx[k] - idx[k - 1] <= context * 2 + 1) group.push(idx[k])
    else { hunks.push(group); group = [idx[k]] }
  }
  hunks.push(group)

  const out = []
  for (const group2 of hunks) {
    const start = Math.max(0, group2[0] - context)
    const end = Math.min(ops.length - 1, group2[group2.length - 1] + context)
    let aCount = 0
    let bCount = 0
    const body = []
    for (let i = start; i <= end; i++) {
      const o = ops[i]
      if (o.aLine != null) aCount++
      if (o.bLine != null) bCount++
      const sign = o.type === 'delete' ? '-' : o.type === 'insert' ? '+' : ' '
      body.push(sign + o.text)
    }
    const aStart = ops[start].aLine ?? beforeLine(ops, start, 'aLine')
    const bStart = ops[start].bLine ?? beforeLine(ops, start, 'bLine')
    out.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`)
    out.push(...body)
  }
  return out.join('\n')
}

/** Line number just before index i on the given side (or 1 at the top). */
function beforeLine(ops, i, side) {
  for (let k = i - 1; k >= 0; k--) {
    if (ops[k][side] != null) return ops[k][side] + 1
  }
  return 1
}

/**
 * Two-column rows for side-by-side views. equal → both sides; insert →
 * right only; delete → left only.
 * @returns [{ left: {type, num, text}|null, right: {type, num, text}|null }]
 */
export function sideBySide(ops) {
  const rows = []
  let i = 0
  while (i < ops.length) {
    const o = ops[i]
    if (o.type === 'equal') {
      rows.push({ left: { type: 'equal', num: o.aLine, text: o.text }, right: { type: 'equal', num: o.bLine, text: o.text } })
      i++
    } else {
      const del = o.type === 'delete' ? { type: 'delete', num: o.aLine, text: o.text } : null
      const ins = o.type === 'insert' ? { type: 'insert', num: o.bLine, text: o.text } : null
      // Pair a delete with the inserts that immediately follow it.
      if (del) {
        const insRows = []
        while (i + 1 < ops.length && ops[i + 1].type === 'insert') { i++; insRows.push(ops[i]) }
        if (!insRows.length) rows.push({ left: del, right: null })
        else {
          insRows.forEach((r, k) => {
            rows.push({ left: k === 0 ? del : null, right: { type: 'insert', num: r.bLine, text: r.text } })
          })
        }
        i++
      } else {
        rows.push({ left: null, right: ins })
        i++
      }
    }
  }
  return rows
}

/** Change statistics for headers/badges. */
export function stats(ops) {
  const equal = ops.filter((o) => o.type === 'equal').length
  const del = ops.filter((o) => o.type === 'delete').length
  const ins = ops.filter((o) => o.type === 'insert').length
  return { equal, deletions: del, insertions: ins, changed: del + ins }
}
