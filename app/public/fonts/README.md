# Self-hosted fonts

Ausculta ships its typefaces rather than linking them. The app is an installed
PWA used in rural clinics that are frequently offline; a `fonts.googleapis.com`
link would resolve to a system fallback precisely when the app is in use, and
would leak a request to a third party on every launch. These files are precached
by the service worker (`vite.config.ts` globs `woff2`).

| File | Family | Weights | Subset | Size |
| --- | --- | --- | --- | --- |
| `figtree-latin.woff2` | Figtree (variable) | 400–700 | latin | 20 KB |
| `noto-sans-latin.woff2` | Noto Sans (variable) | 400–700 | latin | 35 KB |

Figtree is the heading face; Noto Sans is the body face, chosen because it
renders Filipino text well.

## Why latin only, and not latin-ext

Filipino orthography is Latin script: the 28-letter alphabet plus `Ñ`/`ñ`, and
Spanish-derived loanwords carrying `á é í ó ú` and friends. Every one of those
code points is inside the `latin` subset's range (`U+0000-00FF` and the handful
of extras declared in `design/fonts.css`). The `latin-ext` subsets add Central
and Eastern European diacritics that this app has no way to display and no
reason to carry — and for Noto Sans that subset alone is 168 KB, which the
service worker would precache on every install over a slow rural connection.

If a future locale needs those glyphs, re-run the fetch for the `latin-ext`
subset and add a second `@font-face` with its `unicode-range`; the browser then
downloads it only when such a character is actually rendered. A missing glyph
today degrades to a system font for that character, it does not break the page.

## Provenance and licence

Downloaded from the Google Fonts CSS API (`css2`, variable axes `wght@400..700`)
and committed unmodified. Figtree v9, Noto Sans v42.

Both families are licensed under the SIL Open Font License 1.1, which permits
redistribution and self-hosting: <https://openfontlicense.org>.

- Figtree — Erik Kennedy: <https://fonts.google.com/specimen/Figtree>
- Noto Sans — Google: <https://fonts.google.com/noto/specimen/Noto+Sans>
