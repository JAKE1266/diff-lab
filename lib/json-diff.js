/**
 * JSON semantic diff — recursive structural comparison that reports
 * ADD / REMOVE / CHANGE as stable paths ($.user.name, $.items[0].id).
 * Zero dependencies.
 *
 * Design notes:
 *   - Objects compare by keys; arrays compare INDEX-WISE (no LCS matching —
 *     a shifted array reports as trailing add/remove, which is predictable
 *     and reviewable for config files).
 *   - A type change (object → scalar, array → object) is a single CHANGE on
 *     the path, not a cascade of adds/removes.
 *   - undefined does not exist in JSON; absent keys are add/remove.
 */

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

/** Recursively diff two JSON values. Returns [{ path, type, a?, b? }] sorted by path. */
export function jsonDiff(a, b, path = '$', out = []) {
  if (a === b) return out

  const aArr = Array.isArray(a)
  const bArr = Array.isArray(b)
  const aObj = isPlainObject(a)
  const bObj = isPlainObject(b)

  if (aArr && bArr) {
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`
      if (i >= b.length) out.push({ path: p, type: 'remove', a: a[i] })
      else if (i >= a.length) out.push({ path: p, type: 'add', b: b[i] })
      else jsonDiff(a[i], b[i], p, out)
    }
    return out
  }

  if (aObj && bObj) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of [...keys].sort()) {
      const p = `${path}.${k}`
      if (!(k in b)) out.push({ path: p, type: 'remove', a: a[k] })
      else if (!(k in a)) out.push({ path: p, type: 'add', b: b[k] })
      else jsonDiff(a[k], b[k], p, out)
    }
    return out
  }

  // Anything reaching here is a leaf-vs-leaf or type change.
  out.push({ path, type: 'change', a, b })
  return out
}

/** Parse two JSON documents and diff them. Throws 中文 errors on bad input. */
export function jsonDiffText(textA, textB) {
  let a
  let b
  try { a = JSON.parse(String(textA ?? '')) } catch (e) { throw new Error(`左侧不是合法 JSON: ${e.message}`) }
  try { b = JSON.parse(String(textB ?? '')) } catch (e) { throw new Error(`右侧不是合法 JSON: ${e.message}`) }
  return jsonDiff(a, b)
}

/** Human-readable text for the CLI. */
export function jsonDiffText2(op) {
  const fmt = (v) => (v === undefined ? '∅' : JSON.stringify(v))
  switch (op.type) {
    case 'add': return `+ ${op.path} = ${fmt(op.b)}`
    case 'remove': return `- ${op.path} (原 ${fmt(op.a)})`
    default: return `~ ${op.path}: ${fmt(op.a)} → ${fmt(op.b)}`
  }
}

export function jsonDiffReport(ops) {
  if (!ops.length) return '✓ 两个 JSON 完全一致'
  const add = ops.filter((o) => o.type === 'add').length
  const rem = ops.filter((o) => o.type === 'remove').length
  const chg = ops.filter((o) => o.type === 'change').length
  const head = `JSON 差异:${ops.length} 处(+${add} 增 / -${rem} 删 / ~${chg} 改)`
  return head + '\n' + ops.map(jsonDiffText2).join('\n')
}
