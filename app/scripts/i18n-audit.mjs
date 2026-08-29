/**
 * Audit: does every t() call site in the source resolve to a real EN string?
 *
 * The gap this closes. A key that is missing from EN *entirely* is invisible to
 * everything we run today:
 *   - comparing the EN and FIL key trees finds keys missing from ONE of them,
 *     never one absent from both;
 *   - the route crawl spots untranslated keys by the colon in a namespaced key,
 *     so an unprefixed key has nothing to spot;
 *   - i18next renders a missing key as itself, so a button reading "turnOn"
 *     renders, mounts, and passes every assertion that only clicks it.
 *
 * That is not hypothetical: `action.turnOn` shipped referenced-but-undefined
 * past 2157 passing tests and a full route crawl.
 *
 * WHAT IT WILL AND WILL NOT CATCH, stated plainly so the output is not read as
 * more than it is:
 *   - Literal keys are resolved. A key present in NO namespace is a MISS.
 *   - An unprefixed key is resolved against the namespaces that file's `t` is
 *     actually bound to, found by following its `useXTranslation` import to the
 *     i18n module that defines it. A file whose binding cannot be determined is
 *     reported as UNBOUND rather than judged — a wrong guess there produces
 *     confident false alarms in other people's features, which is worse than a
 *     quieter report.
 *   - Template-literal keys (t(`codes:role.${row.role}`)) cannot be resolved
 *     per value, but their literal stem can be: if nothing in the locale starts
 *     with `role.` the call site is dead however it is called, and that is a
 *     DEAD PREFIX. A live stem is as far as this can honestly go, so those are
 *     counted and not listed unless asked.
 *
 * Verified against the bug it was written for: with `action.turnOn` removed from
 * auth.json, it reports both call sites. A clean report from a scanner nobody
 * has seen fail is not evidence of anything.
 *
 * Read-only. Prints a report; writes nothing.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] ?? process.cwd()
const LOCALE_DIR = path.join(ROOT, 'src/i18n/locales/en')
const SRC = path.join(ROOT, 'src')

/** Every EN namespace, as a flat set of dotted key paths. */
function flatten(node, prefix, out) {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix === '' ? key : `${prefix}.${key}`
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out)
    else out.add(full)
  }
  return out
}

const namespaces = new Map()
for (const file of readdirSync(LOCALE_DIR)) {
  if (!file.endsWith('.json')) continue
  const ns = file.slice(0, -'.json'.length)
  namespaces.set(ns, flatten(JSON.parse(readFileSync(path.join(LOCALE_DIR, file), 'utf8')), '', new Set()))
}

/**
 * i18next resolves one written key through several stored ones.
 *
 * `t('queue.locations', { count })` is stored as `locations_one`/`_other`, and
 * `t('home.subtitle', { context: 'example' })` prefers `subtitle_example` but
 * must fall back to plain `subtitle`. Treating a plural-only key as missing
 * would bury the real findings under noise, so a key counts as present if it
 * exists bare OR under any suffix.
 */
const SUFFIXES = ['', '_one', '_other', '_two', '_few', '_many', '_zero']
function presentIn(keys, key) {
  if (SUFFIXES.some((s) => keys.has(key + s))) return true
  // A context variant (`_example`) satisfies a bare lookup that passes context.
  for (const stored of keys) if (stored.startsWith(`${key}_`)) return true
  return false
}

function resolvesAnywhere(key) {
  const colon = key.indexOf(':')
  if (colon !== -1) {
    const ns = key.slice(0, colon)
    const rest = key.slice(colon + 1)
    if (!namespaces.has(ns)) return { ok: false, why: `no such namespace '${ns}'` }
    return namespaces.get(ns).has(rest) || presentIn(namespaces.get(ns), rest)
      ? { ok: true, ns }
      : { ok: false, why: `not in '${ns}'` }
  }
  const found = [...namespaces.entries()].filter(([, keys]) => presentIn(keys, key)).map(([ns]) => ns)
  return found.length > 0 ? { ok: true, ns: found.join('|'), unprefixed: true } : { ok: false, why: 'in no namespace' }
}

/** Every .ts/.tsx under src, tests included — a test can reference a dead key too. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}


/**
 * Which namespaces is a given file's `t` bound to?
 *
 * Each feature exports a `useXTranslation` that wraps `useTranslation(NS)` or
 * `useTranslation([NS, 'codes'])`, with NS a const in the same module. Reading
 * the modules rather than hardcoding a table means a feature added tomorrow is
 * covered without editing this, and a feature that changes its namespace list
 * cannot leave a stale mapping behind that silently blesses the wrong keys.
 */
function hookNamespaces() {
  const byHook = new Map()
  // Normalise the separator first: on Windows `path.join` yields backslashes,
  // and a forward-slash-only pattern silently matched NOTHING here — which does
  // not error, it just leaves every file unbound and turns the whole report
  // into false positives. Exactly the shape of failure this script exists to
  // find, so it is worth the comment.
  for (const file of walk(SRC).filter((f) => /(^|[\\/])i18n\.ts$/.test(f.replace(/\\/g, '/')))) {
    const source = readFileSync(file, 'utf8')
    const consts = new Map()
    for (const m of source.matchAll(/export const (\w+_NS)\s*=\s*'([^']+)'/g)) consts.set(m[1], m[2])
    for (const m of source.matchAll(/export function (use\w*Translation)\s*\(/g)) {
      const hook = m[1]
      // The hook bodies are three or four lines; a fixed window past the
      // signature is enough and avoids brace-matching a language this script
      // has no business parsing.
      const body = source.slice(m.index, m.index + 400)
      const call = /useTranslation\(\s*(\[[^\]]*\]|[\w'"]+)/.exec(body)
      if (call === null) continue
      const names = [...call[1].matchAll(/(\w+_NS)|'([^']+)'/g)].map((x) => consts.get(x[1]) ?? x[2])
      byHook.set(hook, names.filter(Boolean))
    }
  }
  return byHook
}
const HOOK_NS = hookNamespaces()

/** The namespaces in scope for one source file, or null when undeterminable. */
function boundNamespaces(source) {
  const found = new Set()
  for (const hook of HOOK_NS.keys()) {
    if (source.includes(hook)) for (const ns of HOOK_NS.get(hook)) found.add(ns)
  }
  for (const m of source.matchAll(/useTranslation\(\s*'([^']+)'/g)) found.add(m[1])
  for (const m of source.matchAll(/appI18n\.t\(\s*`(\w+):/g)) found.add(m[1])
  return found.size > 0 ? found : null
}

/**
 * Comments out, before anything is scanned.
 *
 * This codebase explains itself heavily, and several of those explanations
 * quote a t() call to say what it does — `screens render t('auth:error.' + code)
 * instead`. Scanned raw, every one of those becomes a confident finding about a
 * line that does not execute. Newlines are preserved so reported line numbers
 * still point at the real line.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (line, lead) => lead + ' '.repeat(line.length - lead.length))
}

const LITERAL = /\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g
const TEMPLATE = /\bt\(\s*`([^`]*)`/g

/**
 * A dynamic key still has a literal prefix, and that prefix can rot.
 *
 * t(`codes:role.${option}`) cannot be resolved without knowing every value
 * `option` takes, but if NOTHING in the codes namespace starts with `role.`
 * then the call site is dead however it is called — a whole branch of the
 * locale renamed or removed out from under it. That is the same failure as a
 * missing literal key, one level up, and it is worth reporting even though the
 * per-value check is not.
 */
function prefixVerdict(raw) {
  const literalPrefix = raw.split('${')[0]
  const colon = literalPrefix.indexOf(':')
  const ns = colon === -1 ? null : literalPrefix.slice(0, colon)
  const stem = colon === -1 ? literalPrefix : literalPrefix.slice(colon + 1)
  if (stem === '') return { checkable: false }
  const pools = ns === null ? [...namespaces.values()] : namespaces.has(ns) ? [namespaces.get(ns)] : []
  if (pools.length === 0) return { checkable: true, ok: false, why: `no such namespace '${ns}'` }
  const hit = pools.some((keys) => [...keys].some((k) => k.startsWith(stem)))
  return { checkable: true, ok: hit, why: hit ? '' : `nothing in the locale starts with '${stem}'` }
}

const misses = []
const unprefixed = []
const dynamic = []
const deadPrefixes = []
let literalCount = 0

for (const file of walk(SRC)) {
  const source = stripComments(readFileSync(file, 'utf8'))
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')

  const bound = boundNamespaces(source)

  for (const match of source.matchAll(LITERAL)) {
    const key = match[2]
    // `t('...')` here also matches things that are not i18next: expect(t(...)),
    // formatters, and so on. A key with no dot and no colon is far more likely
    // to be one of those than a real translation key, so it is skipped rather
    // than reported as a miss.
    if (!key.includes('.') && !key.includes(':')) continue
    literalCount += 1
    const line = source.slice(0, match.index).split('\n').length
    const verdict = resolvesAnywhere(key)
    if (!verdict.ok) {
      misses.push({ rel, line, key, why: verdict.why })
    } else if (verdict.unprefixed === true) {
      if (bound === null) unprefixed.push({ rel, line, key, ns: `unbound; exists in ${verdict.ns}` })
      else if (![...bound].some((ns) => namespaces.has(ns) && presentIn(namespaces.get(ns), key)))
        misses.push({
          rel,
          line,
          key,
          why: `not in this file's namespaces (${[...bound].join(', ')}); exists in ${verdict.ns}`,
        })
    }
  }

  for (const match of source.matchAll(TEMPLATE)) {
    const line = source.slice(0, match.index).split('\n').length
    const verdict = prefixVerdict(match[1])
    if (verdict.checkable && !verdict.ok) deadPrefixes.push({ rel, line, key: match[1], why: verdict.why })
    else dynamic.push({ rel, line, key: match[1] })
  }
}

const report = []
report.push(`Scanned ${literalCount} literal t() keys across ${walk(SRC).length} files.`)
report.push('')
report.push(`MISSES — key resolves in no EN namespace (${misses.length}):`)
for (const m of misses) report.push(`  ${m.rel}:${m.line}  ${m.key}  (${m.why})`)
report.push('')
report.push(`UNBOUND — file's namespaces undeterminable, so the key was not judged (${unprefixed.length}):`)
for (const u of unprefixed) report.push(`  ${u.rel}:${u.line}  ${u.key}  -> ${u.ns}`)
report.push('')
report.push(`DEAD PREFIXES — template key whose literal stem matches nothing (${deadPrefixes.length}):`)
for (const d of deadPrefixes) report.push(`  ${d.rel}:${d.line}  \`${d.key}\`  (${d.why})`)
report.push('')
report.push(`DYNAMIC — template keys with a live prefix, per-value unverifiable (${dynamic.length}).`)
report.push('  Listed only with --verbose; a live prefix is as far as this can honestly go.')
if (process.argv.includes('--verbose'))
  for (const d of dynamic) report.push(`  ${d.rel}:${d.line}  \`${d.key}\``)
console.log(report.join('\n'))
