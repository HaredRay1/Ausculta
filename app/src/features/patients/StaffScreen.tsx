import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ROLES } from '../../db/codes'
import { PATIENT_ROOT } from '../patient/navigation'

/**
 * A clinician screen a patient must not be dropped into.
 *
 * These routes are RequireAuth rather than role-gated because the repository
 * scopes what each role can read — a patient reaching the clinician list sees
 * only their own linked record, so it was never a disclosure. The problem is
 * the CONTAINER, not the contents: the staff navigation correctly refuses to
 * render for a patient and the portal's bottom nav is not there either, so
 * they land on a screen titled "Patients" with a search box and no way out.
 *
 * Everything a patient may legitimately see here already has a better home,
 * with navigation, back handling and copy written for them. So they go there
 * instead of being shown a worse view of data they can already read properly.
 *
 * The repository scoping stays exactly as it is. This is defence in depth, not
 * a replacement for it: if this component were ever removed, the contents
 * would still be correctly scoped.
 */
export function StaffScreen({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  // Rendered inside RequireAuth, so the session is already resolved and `user`
  // is not null here. The optional chain is for the type, not for a real case.
  if (user?.role === ROLES.PATIENT) {
    return <Navigate to={PATIENT_ROOT} replace />
  }
  return <>{children}</>
}
