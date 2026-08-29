import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every t() call site must resolve to a real English string.
 *
 * THE HOLE THIS COVERS, and why nothing else covered it. A key missing from EN
 * *entirely* was invisible to every check in this repository:
 *
 *   - the EN/FIL comparison finds keys missing from ONE tree, never one absent
 *     from both;
 *   - routeCrawl spots untranslated keys by the colon in a namespaced key, so
 *     an unprefixed key has nothing to spot;
 *   - i18next renders a missing key as itself, so a button labelled `turnOn`
 *     renders, mounts, and satisfies any assertion that merely clicks it.
 *
 * That is not a hypothetical. `action.turnOn` was committed referenced-but-
 * undefined and sailed past 2157 passing tests and a full route crawl; the
 * button on the admin screen read "turnOn" and nothing anywhere went red.
 *
 * WHY IT SHELLS OUT rather than importing the logic: scripts/i18n-audit.mjs is
 * the CLI a person runs while fixing this, and duplicating its rules here would
 * create two implementations that drift, with the test blessing a repository
 * the CLI would fail. One implementation, two front doors — `--json` is the
 * door this one uses.
 *
 * WHEN THIS GOES RED: run `node scripts/i18n-audit.mjs .` for the same findings
 * in readable form. The fix is almost always to add the missing string, not to
 * exempt the call site. If a key genuinely belongs outside its file's
 * namespaces, the EXEMPT list at the foot of that script takes one entry naming
 * one key on one file, with a comment saying why — never a widened rule.
 */

const APP_ROOT = process.cwd()
const SCRIPT = path.join(APP_ROOT, 'scripts/i18n-audit.mjs')

interface Finding {
  rel: string
  line: number
  key: string
  why?: string
}

interface AuditResult {
  scanned: number
  files: number
  misses: Finding[]
  unbound: Finding[]
  deadPrefixes: Finding[]
  dynamic: number
}

function audit(): AuditResult {
  const stdout = execFileSync(process.execPath, [SCRIPT, APP_ROOT, '--json'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(stdout) as AuditResult
}

/** `src/features/admin/UsersPage.tsx:213  action.turnOn  (in no namespace)` */
const readable = (rows: Finding[]) =>
  rows.map((row) => `${row.rel}:${row.line}  ${row.key}${row.why === undefined ? '' : `  (${row.why})`}`)

describe('every t() key resolves to an English string', () => {
  const result = audit()

  it('scans a plausible number of call sites', () => {
    /**
     * The guard on the guard.
     *
     * A scanner that silently matches nothing reports a perfect score, and this
     * one has already done exactly that once: its i18n-module filter used a
     * forward-slash-only pattern, so on Windows it matched no files, treated
     * every file as unbound, and produced 72 authoritative-looking false
     * positives. The inverse failure — a regex that stops matching and returns
     * a clean sheet — would be silent, permanent, and indistinguishable from
     * success. So an empty findings list only means something alongside proof
     * that the thing did work.
     */
    expect(result.files).toBeGreaterThan(200)
    expect(result.scanned).toBeGreaterThan(1000)
    expect(result.dynamic).toBeGreaterThan(50)
  })

  it('has no key that resolves in no namespace at all', () => {
    expect(readable(result.misses)).toEqual([])
  })

  it('has no dynamic key whose literal stem matches nothing', () => {
    // t(`codes:role.${x}`) cannot be checked per value, but if NOTHING in the
    // locale starts with `role.` the call site is dead however it is called —
    // a branch of the locale renamed or deleted out from under it.
    expect(readable(result.deadPrefixes)).toEqual([])
  })
})
