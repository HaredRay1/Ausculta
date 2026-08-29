import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards against the structural causes of a sideways-scrolling screen.
 *
 * These are source assertions, not layout assertions, and the distinction is
 * deliberate: jsdom has no layout engine, so `clientWidth`, `scrollWidth` and
 * `getBoundingClientRect()` all return 0 here. A test claiming to prove "no
 * horizontal overflow at 320px" in this environment would assert nothing at
 * all while looking like the strongest test in the suite — which is exactly
 * the kind of control this project refuses to ship.
 *
 * So each of these pins a cause instead of the symptom. Real overflow still
 * needs a browser at 320px; what cannot happen any more is the specific
 * mistakes that put it there, reappearing unnoticed.
 */

const SRC = path.join(process.cwd(), 'src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      sourceFiles(full, out)
      continue
    }
    if (/\.tsx$/.test(entry) && !entry.includes('.test.')) {
      out.push(full.split(path.sep).join('/'))
    }
  }
  return out
}

const files = sourceFiles(SRC)
const read = (file: string) => readFileSync(file, 'utf8')

describe('viewport units', () => {
  it('uses dvh everywhere, never vh or h-screen', () => {
    // `vh` and `h-screen` ignore the mobile browser's dynamic toolbar, so a
    // full-height screen ends up taller than the visible viewport and the last
    // control sits under the chrome.
    const offenders = files.filter((file) => {
      const src = read(file)
      return (
        /\bh-screen\b/.test(src) ||
        /\bmin-h-screen\b/.test(src) ||
        /\b\d+vh\b/.test(src) ||
        /100vh/.test(src)
      )
    })

    expect(offenders).toEqual([])
  })
})

describe('long values cannot force the page sideways', () => {
  it('sets overflow-wrap on the body', () => {
    const tokens = readFileSync(path.join(SRC, 'design/tokens.css'), 'utf8')

    // One study number or a name with no spaces is otherwise enough to make a
    // whole clinical screen scroll horizontally on a 320px phone.
    expect(tokens).toMatch(/overflow-wrap:\s*break-word/)
  })
})

describe('wide content is scrollable rather than overflowing', () => {
  it('keeps every table inside a horizontal scroll container', () => {
    // File-level co-occurrence is approximate, but a table with no scroll
    // guard anywhere in its file is always worth a look: six columns of
    // metrics cannot fit 320px, so the only question is whether they scroll or
    // push the page.
    const unguarded = files.filter(
      (file) => read(file).includes('<table') && !read(file).includes('overflow-x-auto'),
    )

    expect(unguarded).toEqual([])
  })
})

describe('the fixed bottom bar and the space reserved for it', () => {
  const page = readFileSync(path.join(SRC, 'components/layout/Page.tsx'), 'utf8')
  const nav = readFileSync(path.join(SRC, 'components/layout/BottomNav.tsx'), 'utf8')

  it('measures both from one token, so they cannot drift apart', () => {
    // Two independent numbers is how content ends up hidden behind the bar.
    expect(page).toContain('--size-bottom-nav')
    expect(nav).toContain('--size-bottom-nav')
  })

  it('both account for the phone gesture bar', () => {
    expect(page).toContain('safe-area-inset-bottom')
    expect(nav).toContain('safe-area-inset-bottom')
  })

  it('wraps navigation labels rather than truncating them', () => {
    // Five destinations leave about 58px each at 320px — roughly eight
    // characters. "Breathing plan" clipped in English; "Plano sa paghinga" and
    // "Tungkol sa akin" clipped to nonsense in Filipino. The label is the only
    // thing making a destination findable to someone navigating unaided.
    // Comments are stripped first: this file's own explanation of the fix
    // mentions truncation, and matching that would be checking the prose.
    const code = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/truncate/)
    expect(code).toContain('line-clamp-2')
  })
})

describe('reading measure on a tablet', () => {
  it('caps the content column rather than stretching it', () => {
    const page = readFileSync(path.join(SRC, 'components/layout/Page.tsx'), 'utf8')

    // A clinic tablet should not get phone content stretched to a 700px line.
    expect(page).toMatch(/max-w-/)
  })
})
