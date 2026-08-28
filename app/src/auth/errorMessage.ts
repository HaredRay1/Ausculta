import { AuthError } from './authService'

/**
 * Maps a thrown value to a key in the `auth` translation namespace.
 *
 * Screens never render an Error's `message` — those are developer-facing
 * English and would appear untranslated in front of a Filipino-speaking health
 * worker. Anything that is not a recognised `AuthError` becomes the generic
 * "something went wrong", which is honest: we genuinely do not know what to
 * tell the user about an unexpected IndexedDB failure.
 */
export function authErrorKey(error: unknown): string {
  return error instanceof AuthError ? `error.${error.code}` : 'error.UNEXPECTED'
}
