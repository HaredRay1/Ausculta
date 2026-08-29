/**
 * Rasterises assets/*.svg into the Android launcher icon and splash set.
 *
 * WHY THIS EXISTS RATHER THAN @capacitor/assets
 *
 * Two reasons, and the second is the one that matters.
 *
 * 1. `@capacitor/assets` is a dev-dependency install, and this repo's
 *    node_modules is shared between concurrent agents — a mid-flight install
 *    corrupts it for everyone. Headless Chrome is already on the machine and
 *    produces the same PNGs.
 *
 * 2. `app/android/` is gitignored. Every file this script writes is therefore
 *    invisible to git, so the icons live in a build directory that any
 *    `npx cap add android` will recreate from Capacitor's defaults. The SVGs in
 *    `assets/` are the committed source of truth, and this script is how they
 *    get back onto disk. Run it after regenerating the Android project, or the
 *    app ships with the framework's robot-head icon again.
 *
 * Usage:  node scripts/generate-android-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')
const ASSETS = join(APP, 'assets')
const RES = join(APP, 'android', 'app', 'src', 'main', 'res')

/** 108dp adaptive layer. The launcher may crop the outer quarter of this. */
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
/** 48dp legacy icon, shown whole. */
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

/** --color-primary and the PWA manifest theme_color. */
const BRAND_PRIMARY = '#0F766E'
/** --color-primary-strong, the darker fill white sits on. Status bar. */
const BRAND_PRIMARY_STRONG = '#115E59'
const SPLASH_BACKGROUND = '#0B1220'
/** Mark width as a fraction of the splash's shorter side. */
const SPLASH_MARK_FRACTION = 0.3

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  const found = candidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      'No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser and re-run.',
    )
  }
  return found
}

/** Width and height straight out of the PNG header. */
function pngSize(path) {
  const head = readFileSync(path).subarray(16, 24)
  return { width: head.readUInt32BE(0), height: head.readUInt32BE(4) }
}

const chrome = findChrome()
const scratch = mkdtempSync(join(tmpdir(), 'ausculta-icons-'))

function render(svgName, outPath, width, height, { background, markFraction } = {}) {
  const src = `file:///${join(ASSETS, svgName).replaceAll('\\', '/')}`
  const image =
    markFraction === undefined
      ? `<img src="${src}" style="width:${width}px;height:${height}px;display:block">`
      : `<div style="width:${width}px;height:${height}px;display:flex;align-items:center;` +
        `justify-content:center"><img src="${src}" style="width:${Math.round(
          Math.min(width, height) * markFraction,
        )}px"></div>`

  const page = join(scratch, 'page.html')
  writeFileSync(
    page,
    `<!doctype html><meta charset=utf-8><style>html,body{margin:0;padding:0;${
      background ? `background:${background};` : ''
    }}</style>${image}`,
  )

  execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    ...(background ? [] : ['--default-background-color=00000000']),
    `--screenshot=${outPath}`,
    `--window-size=${width},${height}`,
    `file:///${page.replaceAll('\\', '/')}`,
  ])

  // Assert rather than assume: a silently wrong size ships a blurry icon.
  const got = pngSize(outPath)
  if (got.width !== width || got.height !== height) {
    throw new Error(`${outPath}: expected ${width}x${height}, got ${got.width}x${got.height}`)
  }
}

if (!existsSync(RES)) {
  throw new Error(`No Android project at ${RES}. Run "npx cap add android" first.`)
}

let written = 0
for (const [density, size] of Object.entries(ADAPTIVE)) {
  render('icon-foreground.svg', join(RES, `mipmap-${density}`, 'ic_launcher_foreground.png'), size, size)
  written += 1
}
for (const [density, size] of Object.entries(LEGACY)) {
  render('icon-legacy.svg', join(RES, `mipmap-${density}`, 'ic_launcher.png'), size, size)
  render('icon-round.svg', join(RES, `mipmap-${density}`, 'ic_launcher_round.png'), size, size)
  written += 2
}

// Every splash the project already ships, regenerated at its own dimensions —
// so this never has to guess which density buckets Capacitor created.
for (const entry of readdirSync(RES)) {
  const splash = join(RES, entry, 'splash.png')
  if (!existsSync(splash) || !statSync(splash).isFile()) continue
  const { width, height } = pngSize(splash)
  render('splash-mark.svg', splash, width, height, {
    background: SPLASH_BACKGROUND,
    markFraction: SPLASH_MARK_FRACTION,
  })
  written += 1
}

/*
 * The two colour resources, rewritten here for the same reason as the PNGs:
 * they live under the gitignored android/ tree, so a regenerated project comes
 * back with Capacitor's white icon background and its default blue system
 * chrome unless something puts these back.
 */
const VALUES = join(RES, 'values')

writeFileSync(
  join(VALUES, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND_PRIMARY}</color>
</resources>
`,
)

writeFileSync(
  join(VALUES, 'colors.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-android-icons.mjs. Matches the web tokens:
     colorPrimary is the web color-primary token and the manifest theme_color;
     colorPrimaryDark is the color-primary-strong token. Without these, styles.xml
     resolves them from the Capacitor library and the system chrome is blue. -->
<resources>
    <color name="colorPrimary">${BRAND_PRIMARY}</color>
    <color name="colorPrimaryDark">${BRAND_PRIMARY_STRONG}</color>
    <color name="colorAccent">${BRAND_PRIMARY}</color>
</resources>
`,
)

console.log(`${written} files written to ${RES}`)
console.log('Colour resources rewritten: values/ic_launcher_background.xml, values/colors.xml')
