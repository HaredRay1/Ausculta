import { DecodeError, WavParseError } from '../../../audio'
import type { DecodeErrorCode, WavErrorCode } from '../../../audio'

/**
 * Import failures -> the sentence a health worker can act on.
 *
 * "Invalid file" is worthless in a clinic: the person holding the phone has to
 * know whether to copy the file again, choose a different one, or go back and
 * re-record the patient. The audio module carries a `code` on every failure
 * precisely so this layer can say which. Each code therefore gets its own key
 * and its own sentence, and `importErrors.test.ts` asserts both that the keys
 * are distinct and that every one has English copy behind it.
 */

/** Every `DecodeError` code the audio module can raise. */
export const DECODE_ERROR_CODES: readonly DecodeErrorCode[] = [
  'empty',
  'too-long',
  'decode-failed',
]

/** Every `WavParseError` code the audio module can raise. */
export const WAV_ERROR_CODES: readonly WavErrorCode[] = [
  'not-riff',
  'missing-fmt',
  'missing-data',
  'no-frames',
  'unsupported-format',
  'unsupported-bit-depth',
]

/**
 * For a failure with no code — a storage error, a permissions refusal, a bug.
 * It says what to try rather than pretending to a diagnosis it does not have.
 */
export const IMPORT_ERROR_UNKNOWN_KEY = 'import.error.unknown'

/**
 * The i18n key for one import failure.
 *
 * The two code vocabularies do not overlap, so they share one flat namespace;
 * the test asserts that, rather than trusting it.
 */
export function importErrorKey(error: unknown): string {
  if (error instanceof DecodeError) return `import.error.${error.code}`
  if (error instanceof WavParseError) return `import.error.${error.code}`
  return IMPORT_ERROR_UNKNOWN_KEY
}
