import type { i18n as I18nInstance } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n as appI18n } from '../../i18n'
import enStaff from '../../i18n/locales/en/staff.json'

/** Registers the `staff` namespace, following `auth/i18n.ts` exactly. */
export const STAFF_NS = 'staff'

export function registerStaffResources(instance: I18nInstance): I18nInstance {
  if (!instance.hasResourceBundle('en', STAFF_NS)) {
    instance.addResourceBundle('en', STAFF_NS, enStaff, true, true)
  }
  return instance
}

registerStaffResources(appI18n)

/** `useTranslation('staff')` plus `codes`, since the role is a code. */
export function useStaffTranslation() {
  return useTranslation([STAFF_NS, 'codes'], { useSuspense: false })
}
