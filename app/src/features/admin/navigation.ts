/** Where each admin screen lives. One source, so links cannot drift. */
export const ADMIN_PATHS = {
  accounts: '/admin/users',
  config: '/admin/config',
  audit: '/admin/audit',
  translations: '/admin/translations',
} as const

export type AdminNavId = keyof typeof ADMIN_PATHS

export interface AdminNavEntry {
  id: AdminNavId
  path: string
  labelKey: string
}

/** Order is the order they appear in the console's own navigation. */
export const ADMIN_NAV: readonly AdminNavEntry[] = [
  { id: 'accounts', path: ADMIN_PATHS.accounts, labelKey: 'admin:nav.accounts' },
  { id: 'config', path: ADMIN_PATHS.config, labelKey: 'admin:nav.config' },
  { id: 'audit', path: ADMIN_PATHS.audit, labelKey: 'admin:nav.audit' },
  { id: 'translations', path: ADMIN_PATHS.translations, labelKey: 'admin:nav.translations' },
]
