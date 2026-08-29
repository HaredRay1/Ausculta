import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the two things about the token layer that are easy to break silently
 * and impossible to notice in review:
 *
 * 1. Contrast. "WCAG AA" is a number, so it is asserted as one — computed from
 *    the hex values actually in tokens.css, in both themes, rather than trusted
 *    because someone eyeballed the palette once.
 *
 * 2. Theme-following. A Tailwind utility that bakes a literal value in at build
 *    time looks identical in the source but ignores the dark override entirely.
 *    That is exactly what `shadow-*` did, which is why elevation is an
 *    `@utility` instead. These tests compile the real stylesheet and check the
 *    emitted CSS still references `var(--token)`.
 */

const DESIGN_DIR = path.join(process.cwd(), 'src/design')
const tokensCss = readFileSync(path.join(DESIGN_DIR, 'tokens.css'), 'utf8')

/** Pulls `--name: value;` pairs out of one brace-delimited block. */
function readBlock(css: string, opener: string): Map<string, string> {
  const start = css.indexOf(opener)
  if (start === -1) throw new Error(`block not found: ${opener}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)

  const tokens = new Map<string, string>()
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim())
  }
  return tokens
}

const lightTokens = readBlock(tokensCss, '@theme static')
const darkTokens = readBlock(tokensCss, "[data-theme='dark']")

/** sRGB channel to linear light. */
function channelToLinear(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const normalised = hex.trim().replace('#', '')
  const r = Number.parseInt(normalised.slice(0, 2), 16)
  const g = Number.parseInt(normalised.slice(2, 4), 16)
  const b = Number.parseInt(normalised.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) throw new Error(`not a hex colour: ${hex}`)
  return (
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  )
}

/** WCAG 2.1 contrast ratio, 1:1 to 21:1. */
function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

function resolve(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`token not defined: ${name}`)
  return value
}

/**
 * Every foreground/background pair the components actually put on screen.
 *
 * `min` is 4.5 for anything carrying text. The focus ring and borders are
 * non-text UI, which WCAG 1.4.11 sets at 3:1.
 */
const CONTRAST_PAIRS: ReadonlyArray<{ fg: string; bg: string; min: number; note: string }> = [
  { fg: '--color-on-surface', bg: '--color-surface', min: 4.5, note: 'body text' },
  { fg: '--color-on-surface', bg: '--color-card', min: 4.5, note: 'text on a card' },
  { fg: '--color-on-surface', bg: '--color-nested', min: 4.5, note: 'text on a well' },
  { fg: '--color-muted', bg: '--color-surface', min: 4.5, note: 'secondary text' },
  { fg: '--color-muted', bg: '--color-card', min: 4.5, note: 'secondary on a card' },

  // The three roles components actually name. Every ink that lands on a card
  // is asserted here, because the card is where almost all reading happens.
  { fg: '--color-on-surface', bg: '--color-page', min: 4.5, note: 'text on the page' },
  { fg: '--color-muted', bg: '--color-page', min: 4.5, note: 'secondary on the page' },
  { fg: '--color-muted', bg: '--color-nested', min: 4.5, note: 'secondary in a well' },
  { fg: '--color-border-strong', bg: '--color-card', min: 3, note: 'input outline on a card' },
  { fg: '--color-border-strong', bg: '--color-nested', min: 3, note: 'outline in a well' },

  /*
   * The status inks, on a card, are the constraint that decides the whole
   * surface strategy — so they are asserted on the exact role they land on.
   *
   * They were picked against white and have almost no headroom: destructive is
   * 4.83:1 there. One tier down the ladder it is 4.34:1 and two tiers down
   * 3.92:1. So in light mode a card cannot be tinted, and the page has to move
   * instead. These four lines are what will go red if anybody tries it again.
   */
  { fg: '--color-destructive', bg: '--color-card', min: 4.5, note: 'destructive ink on a card' },
  { fg: '--color-success', bg: '--color-card', min: 4.5, note: 'success ink on a card' },
  { fg: '--color-warning', bg: '--color-card', min: 4.5, note: 'warning ink on a card' },
  { fg: '--color-primary', bg: '--color-card', min: 4.5, note: 'teal on a card' },

  { fg: '--color-on-sample', bg: '--color-sample', min: 4.5, note: 'sample-data pill' },

  { fg: '--color-primary', bg: '--color-surface', min: 4.5, note: 'link and icon teal' },
  { fg: '--color-on-primary', bg: '--color-primary-strong', min: 4.5, note: 'primary button' },
  { fg: '--color-on-accent', bg: '--color-accent', min: 4.5, note: 'selected chip' },

  { fg: '--color-on-info', bg: '--color-info', min: 4.5, note: 'solid info' },
  { fg: '--color-on-info-surface', bg: '--color-info-surface', min: 4.5, note: 'info banner' },
  { fg: '--color-on-success', bg: '--color-success', min: 4.5, note: 'solid success' },
  {
    fg: '--color-on-success-surface',
    bg: '--color-success-surface',
    min: 4.5,
    note: 'success banner',
  },
  { fg: '--color-on-warning', bg: '--color-warning', min: 4.5, note: 'solid warning' },
  {
    fg: '--color-on-warning-surface',
    bg: '--color-warning-surface',
    min: 4.5,
    note: 'warning banner',
  },
  {
    fg: '--color-on-destructive',
    bg: '--color-destructive',
    min: 4.5,
    note: 'destructive button',
  },
  {
    fg: '--color-on-destructive-surface',
    bg: '--color-destructive-surface',
    min: 4.5,
    note: 'danger banner',
  },

  // Feature screens colour icons and inline status text directly with these
  // on a card, so the pairs are load-bearing outside the banner components.
  { fg: '--color-info', bg: '--color-card', min: 4.5, note: 'info ink on a card' },
  {
    fg: '--color-destructive',
    bg: '--color-card',
    min: 4.5,
    note: 'destructive ink on a card',
  },

  // The layered surfaces and the chrome the bars sit on. Added with the
  // surfaces themselves rather than after, so "AA on every new surface" is a
  // number here rather than a claim in a commit message.
  { fg: '--color-on-chrome', bg: '--color-chrome', min: 4.5, note: 'app bar and nav text' },
  { fg: '--color-primary', bg: '--color-chrome', min: 4.5, note: 'the mark on the chrome' },

  // The avatar and icon-tile palette. Five hues, both themes, every one
  // carrying initials or a glyph — so all ten pairs are text pairs.
  { fg: '--color-on-tone-1', bg: '--color-tone-1', min: 4.5, note: 'tone 1' },
  { fg: '--color-on-tone-2', bg: '--color-tone-2', min: 4.5, note: 'tone 2' },
  { fg: '--color-on-tone-3', bg: '--color-tone-3', min: 4.5, note: 'tone 3' },
  { fg: '--color-on-tone-4', bg: '--color-tone-4', min: 4.5, note: 'tone 4' },
  { fg: '--color-on-tone-5', bg: '--color-tone-5', min: 4.5, note: 'tone 5' },

  { fg: '--color-focus', bg: '--color-surface', min: 3, note: 'focus ring (non-text UI)' },
  { fg: '--color-border-strong', bg: '--color-surface', min: 3, note: 'input border' },
]

describe.each([
  ['light', lightTokens],
  ['dark', darkTokens],
])('%s theme contrast', (themeName, tokens) => {
  it.each(CONTRAST_PAIRS)('$note: $fg on $bg clears $min:1', ({ fg, bg, min }) => {
    const ratio = contrastRatio(resolve(tokens, fg), resolve(tokens, bg))

    expect(
      ratio,
      `${themeName}: ${fg} (${resolve(tokens, fg)}) on ${bg} (${resolve(tokens, bg)}) ` +
        `is ${ratio.toFixed(2)}:1, below the required ${min}:1`,
    ).toBeGreaterThanOrEqual(min)
  })
})

describe('theme completeness', () => {
  it('gives every light colour token a dark counterpart', () => {
    const lightColours = [...lightTokens.keys()].filter((name) => name.startsWith('--color-'))
    const missing = lightColours.filter((name) => !darkTokens.has(name))

    expect(lightColours.length).toBeGreaterThan(20)
    expect(missing).toEqual([])
  })

  it('introduces no dark-only colour token', () => {
    // A dark-only name means a component would have to branch on the theme
    // instead of just naming a token.
    const darkOnly = [...darkTokens.keys()].filter(
      (name) => name.startsWith('--color-') && !lightTokens.has(name),
    )

    expect(darkOnly).toEqual([])
  })

  it('separates the three surface layers, so a card reads as a card', () => {
    // The owner's verdict on the previous palette was "a flat navy page" — one
    // surface doing three jobs. These are not WCAG numbers (surface-to-surface
    // is not a text pair); they are the reason the layering is visible at all,
    // so they are pinned rather than left to drift back to flat.
    for (const [name, tokens] of [
      ['light', lightTokens],
      ['dark', darkTokens],
    ] as const) {
      const page = relativeLuminance(resolve(tokens, '--color-surface'))
      const card = relativeLuminance(resolve(tokens, '--color-card'))
      const chrome = relativeLuminance(resolve(tokens, '--color-chrome'))

      expect(card, `${name}: card must differ from the page`).not.toBeCloseTo(page, 4)
      expect(chrome, `${name}: chrome must differ from the page`).not.toBeCloseTo(page, 4)
    }
  })

  it('keeps the light and dark surfaces genuinely different', () => {
    expect(resolve(lightTokens, '--color-surface')).not.toBe(
      resolve(darkTokens, '--color-surface'),
    )
    expect(relativeLuminance(resolve(lightTokens, '--color-surface'))).toBeGreaterThan(0.5)
    expect(relativeLuminance(resolve(darkTokens, '--color-surface'))).toBeLessThan(0.1)
  })
})

/**
 * The printed sheet is the one artefact that leaves the app on paper and goes
 * to a hospital, and it is the only surface where the colour tokens cannot
 * help — so the print palette has to beat every other palette in the cascade.
 */
describe('the surface ladder', () => {
  /**
   * Checklist item 4: a card must sit at least two tonal steps from its page.
   *
   * The number behind the rule is that ADJACENT tiers are only 1.04-1.09:1
   * apart — a 4-9% luminance change. That reads on the screen a designer owns
   * and disappears on a cheap LCD in daylight, which is where this app is
   * actually going. A 390px capture of the old white-on-#f7f8fa card measured
   * 1.063:1 and was the first thing lost.
   *
   * So this asserts the SEPARATION, not the colours. A later palette change is
   * free to move both values; it is not free to put a card one tier off its
   * page again.
   */
  const TWO_TIERS = 1.12

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ])('separates a card from its page by at least two tiers in %s', (_theme, tokens) => {
    expect(contrastRatio(resolve(tokens, '--color-card'), resolve(tokens, '--color-page'))).toBeGreaterThanOrEqual(TWO_TIERS)
  })

  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ])('separates a nested well from the card it sits in, in %s', (_theme, tokens) => {
    expect(contrastRatio(resolve(tokens, '--color-nested'), resolve(tokens, '--color-card'))).toBeGreaterThanOrEqual(TWO_TIERS)
  })

  it('keeps the card lighter than its page in BOTH themes', () => {
    /**
     * The one sentence the whole strategy reduces to, and the reason the light
     * and dark roles do not sit at the same rung: in dark the card climbs the
     * ladder, in light the page descends it, because a white card has nowhere
     * above it to go. Stated as a test so a future palette cannot quietly
     * invert one theme and leave the other alone.
     */
    for (const tokens of [lightTokens, darkTokens]) {
      const card = relativeLuminance(resolve(tokens, '--color-card'))
      const page = relativeLuminance(resolve(tokens, '--color-page'))
      expect(card).toBeGreaterThan(page)
    }
  })

  it('makes the sample-data pill the loudest thing on the page', () => {
    // Its job is that nobody mistakes seeded data for a real patient, so being
    // the most conspicuous object on the screen is the requirement.
    for (const tokens of [lightTokens, darkTokens]) {
      const pill = contrastRatio(resolve(tokens, '--color-sample'), resolve(tokens, '--color-page'))
      const card = contrastRatio(resolve(tokens, '--color-card'), resolve(tokens, '--color-page'))
      expect(pill).toBeGreaterThan(card)
    }
  })
})

describe('print palette', () => {
  const printCss = readFileSync(path.join(DESIGN_DIR, 'print.css'), 'utf8')

  /** Crude but sufficient: count id, class/attribute/pseudo-class, and type. */
  function specificity(selector: string): number {
    const ids = (selector.match(/#/g) ?? []).length
    const classes =
      (selector.match(/\.[a-zA-Z]/g) ?? []).length +
      (selector.match(/\[/g) ?? []).length +
      (selector.match(/:(?!not\()[a-zA-Z-]+/g) ?? []).length
    return ids * 100 + classes * 10
  }

  it('overrides the dark theme rather than losing to it', () => {
    // tokens.css darkens with `:root:not([data-theme='light'])`, which is more
    // specific than a bare `:root`. A print block written as `:root` would lose
    // on a phone whose system theme is dark, and print white text on black.
    const darkSelector = ":root:not([data-theme='light'])"
    const printSelector = printCss
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .find((line) => line.startsWith(':root') && line.includes('root:root'))

    expect(printSelector, 'print.css must raise its own specificity').toBeDefined()
    expect(specificity(printSelector as string)).toBeGreaterThan(specificity(darkSelector))
  })

  it('forces ink to black and every surface to white', () => {
    const block = printCss.slice(printCss.indexOf('@media print'))
    for (const token of [
      '--color-surface: #ffffff',
      '--color-card: #ffffff',
      '--color-on-surface: #000000',
      '--color-muted: #000000',
      '--color-border: #000000',
    ]) {
      expect(block).toContain(token)
    }
  })

  it('prints A4 and hides the screen-only furniture', () => {
    expect(printCss).toContain('size: A4')
    expect(printCss).toContain('.no-print')
    expect(printCss).toContain('break-inside: avoid')
  })
})

describe('compiled stylesheet', () => {
  /** Compiles src/index.css exactly as the Vite plugin would. */
  async function build(candidates: string[]): Promise<string> {
    const { compile } = await import('tailwindcss')
    const root = process.cwd()
    const entry = readFileSync(path.join(root, 'src/index.css'), 'utf8')

    const compiler = await compile(entry, {
      base: path.join(root, 'src'),
      loadStylesheet: async (id: string, base: string) => {
        const file = id.startsWith('.')
          ? path.resolve(base, id)
          : path.join(root, 'node_modules', id, 'index.css')
        return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
      },
    })
    return compiler.build(candidates)
  }

  /**
   * Built from a plain string, not a template literal. `\s` and `\{` inside a
   * template literal are not escapes — JS drops the backslash, so the pattern
   * silently becomes `.text-stats*{`, matches nothing, and the assertion fails
   * for a reason that has nothing to do with the stylesheet.
   */
  const ruleFor = (css: string, role: string) =>
    new RegExp('\\.text-' + role + '\\s*\\{([^}]*)\\}').exec(css)

  it('emits a real size, weight, line-height and tracking for every type role', async () => {
    /**
     * The ramp is declared as `--text-stat` plus three sibling keys
     * (`--text-stat--line-height` and so on). That naming convention is what
     * makes Tailwind fold all four into ONE `text-stat` utility — and if a
     * sibling is misspelled nothing errors: the utility still emits, just
     * without the line-height, and the page silently falls back to the browser
     * default. Which is the state this codebase was already in, with zero
     * explicit leading or tracking in 150 components.
     *
     * So this asserts the four properties actually arrive, rather than that
     * the class exists.
     */
    const ROLES = [
      'display-hero',
      'display-l',
      'display-m',
      'stat',
      'headline',
      'title-l',
      'title-m',
      'title-s',
      'body',
      'body-s',
      'label',
      'overline',
    ]
    const css = await build(ROLES.map((role) => `text-${role}`))

    for (const role of ROLES) {
      const rule = ruleFor(css, role)
      expect(rule, `text-${role} should compile to a rule`).not.toBeNull()
      const body = rule?.[1] ?? ''
      expect(body, `text-${role} needs a size`).toMatch(/font-size:/)
      expect(body, `text-${role} needs an explicit line-height`).toMatch(/line-height:/)
      expect(body, `text-${role} needs a weight`).toMatch(/font-weight:/)
    }

    // Large type tightens, small type loosens — checklist item 7. Body and the
    // titles that sit at body size deliberately carry none.
    const tracked = await build(['text-display-hero', 'text-stat', 'text-label', 'text-overline'])
    for (const role of ['display-hero', 'stat', 'label', 'overline']) {
      const rule = ruleFor(tracked, role)
      expect(rule?.[1] ?? '', `text-${role} needs tracking`).toMatch(/letter-spacing:/)
    }
  })

  it('emits semantic utilities that reference a token, never a baked-in value', async () => {
    const css = await build([
      'bg-surface',
      'bg-card',
      'text-on-surface',
      'text-muted',
      'border-border',
      'bg-primary-strong',
      'text-on-primary',
      'bg-accent',
      'text-on-accent',
      'bg-warning-surface',
      'text-on-warning-surface',
      'rounded-card',
      'rounded-control',
      'font-heading',
      'elevation-1',
      'elevation-2',
    ])

    for (const token of [
      '--color-surface',
      '--color-card',
      '--color-on-surface',
      '--color-muted',
      '--color-border',
      '--color-primary-strong',
      '--color-on-primary',
      '--color-accent',
      '--color-on-accent',
      '--color-warning-surface',
      '--color-on-warning-surface',
      '--radius-card',
      '--radius-control',
      '--font-heading',
      '--shadow-e1',
      '--shadow-e2',
    ]) {
      expect(css, `${token} should be referenced as var(${token}) by a utility`).toContain(
        `var(${token})`,
      )
    }
  })

  it('ships both themes and the accessibility base rules', async () => {
    const css = await build(['bg-surface'])

    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain('data-theme')
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('focus-visible')
    expect(css).toContain('outline: 3px solid var(--color-focus)')
  })

  it('self-hosts both faces with no network reference', async () => {
    const css = await build(['font-sans'])

    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css).toContain('/fonts/figtree-latin.woff2')
    expect(css).toContain('/fonts/noto-sans-latin.woff2')
    expect(css).toContain('font-display: swap')

    // The whole point of self-hosting: every url() the browser will fetch must
    // be a same-origin path. (Checking the file for "https://" instead would
    // only catch Tailwind's own licence banner.)
    const fetched = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''))
    expect(fetched.length).toBeGreaterThan(0)
    for (const url of fetched) {
      expect(url, `${url} must be a local path, not a remote fetch`).toMatch(/^\//)
    }
  })

  it('leaves the stock Tailwind palette intact for screens already built on it', async () => {
    // Other agents shipped screens using bg-teal-700 / text-slate-900 before
    // this system existed. Adding semantic tokens must not redefine those.
    const css = await build(['bg-teal-700', 'text-slate-900'])

    expect(css).toContain('--color-teal-700')
    expect(css).toContain('--color-slate-900')
  })
})
