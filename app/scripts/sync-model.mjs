// Copies the Edge Impulse WASM deployment's browser files into
// public/models/ei-disease-v5/ so Vite serves (and Workbox precaches) them,
// stripping the .wasm's debug sections on the way through.
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

const VERBATIM_FILES = ['edge-impulse-standalone.js', 'run-impulse.js']
const WASM_FILE = 'edge-impulse-standalone.wasm'

/**
 * Custom sections dropped from the shipped module.
 *
 * The Studio export carries DWARF and the function-name table — 5.3 MB of the
 * 8.2 MB binary, none of which the engine reads to run inference. They are
 * WebAssembly *custom* sections: by specification an implementation must
 * ignore any it does not recognise, so removing them cannot change what the
 * module computes. What it does cost is readable function names in a trap's
 * stack trace from inside the wasm; the unmodified export stays in
 * model/.../browser/ for when that is what you need.
 */
const isStrippable = (name) => name === 'name' || name.startsWith('.debug')

/** Read an unsigned LEB128 at `offset`. @returns {[value, nextOffset]} */
function readVarUint(bytes, offset) {
  let result = 0
  let shift = 0
  let byte
  do {
    if (offset >= bytes.length) throw new Error('truncated LEB128')
    byte = bytes[offset++]
    result += (byte & 0x7f) * 2 ** shift
    shift += 7
  } while (byte & 0x80)
  return [result, offset]
}

/**
 * Drop the debug custom sections from a wasm module.
 *
 * Every section that survives is copied BYTE FOR BYTE, header included — the
 * walk only decides what to keep, it never re-encodes anything, so a section
 * this script does not understand passes through untouched.
 *
 * @param {Buffer} bytes
 * @returns {{ output: Buffer, dropped: { name: string, bytes: number }[] }}
 */
function stripDebugSections(bytes) {
  if (bytes.length < 8 || bytes.readUInt32LE(0) !== 0x6d736100) {
    throw new Error('not a WebAssembly module (bad magic)')
  }

  const keep = [bytes.subarray(0, 8)] // magic + version
  const dropped = []
  let offset = 8

  while (offset < bytes.length) {
    const sectionStart = offset
    const id = bytes[offset++]
    const [payloadLength, afterLength] = readVarUint(bytes, offset)
    const payloadStart = afterLength
    const sectionEnd = payloadStart + payloadLength
    if (sectionEnd > bytes.length) throw new Error(`section at ${sectionStart} runs past end of file`)

    if (id === 0) {
      const [nameLength, afterNameLength] = readVarUint(bytes, payloadStart)
      const name = bytes.toString('utf8', afterNameLength, afterNameLength + nameLength)
      if (isStrippable(name)) {
        dropped.push({ name, bytes: sectionEnd - sectionStart })
        offset = sectionEnd
        continue
      }
    }

    keep.push(bytes.subarray(sectionStart, sectionEnd))
    offset = sectionEnd
  }

  return { output: Buffer.concat(keep), dropped }
}

const kb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`

const source = fs.readFileSync(path.join(SOURCE_DIR, WASM_FILE))
const { output, dropped } = stripDebugSections(source)

// Compile before writing. A module that no longer validates must never reach
// public/ — the app would fail at load with an error pointing at the model
// rather than at this script.
new WebAssembly.Module(output)

fs.mkdirSync(DEST_DIR, { recursive: true })

for (const file of VERBATIM_FILES) {
  fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(DEST_DIR, file))
  console.log(`synced ${file}`)
}

fs.writeFileSync(path.join(DEST_DIR, WASM_FILE), output)
console.log(`synced ${WASM_FILE}`)

if (dropped.length === 0) {
  console.log('  no debug sections present — copied as exported')
} else {
  for (const section of dropped) console.log(`  dropped ${section.name} (${kb(section.bytes)})`)
  const saved = source.length - output.length
  console.log(
    `  ${kb(source.length)} -> ${kb(output.length)} (${((saved / source.length) * 100).toFixed(0)}% smaller)`,
  )
}

console.log(
  `Synced ${VERBATIM_FILES.length + 1} model files into ${path.relative(repoRoot, DEST_DIR)}`,
)
