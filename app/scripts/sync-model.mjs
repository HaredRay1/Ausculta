// Copies the Edge Impulse WASM deployment's browser files into
// public/models/ei-disease-v5/ so Vite serves (and Workbox precaches) them.
//
// The source directory name contains a literal "#" (impulse-#1). new URL()/
// fileURLToPath() treat "#" as a URL fragment delimiter and would silently
// truncate the path, so once we know the script's own directory (safe — it
// has no "#"), every path below is built with plain node:path joins, never
// re-parsed as a URL.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url)) // app/scripts
const appDir = path.dirname(scriptDir) // app/
const repoRoot = path.dirname(appDir) // repo root

const SOURCE_DIR = path.join(
  repoRoot,
  'model',
  'smartstethoscope-wasm-browser-simd-v5-impulse-#1',
  'browser',
)
const DEST_DIR = path.join(appDir, 'public', 'models', 'ei-disease-v5')

const FILES = ['edge-impulse-standalone.js', 'edge-impulse-standalone.wasm', 'run-impulse.js']

fs.mkdirSync(DEST_DIR, { recursive: true })

for (const file of FILES) {
  const src = path.join(SOURCE_DIR, file)
  const dest = path.join(DEST_DIR, file)
  fs.copyFileSync(src, dest)
  console.log(`synced ${file}`)
}

console.log(`Synced ${FILES.length} model files into ${path.relative(repoRoot, DEST_DIR)}`)
