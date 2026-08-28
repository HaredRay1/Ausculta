import { ROLES, type Role } from '../../db/codes'

/**
 * The fictional clinic staff who "took" and "reviewed" the seeded assessments.
 *
 * These are **not** rows in the `users` table, and that is deliberate. `User`
 * carries no `isDemo` field, so a seeded account could not be told apart from
 * a real one, could not be cleaned up by `resetDemoData` without guessing, and
 * would show up in the admin user list and in first-run admin bootstrap checks
 * as though someone had really registered. Inventing accounts inside the auth
 * system to make demo data look complete is exactly the kind of shortcut that
 * later gets mistaken for real.
 *
 * So the ids below are dangling references by design: `Assessment.assessorId`
 * and `practitionerReviewerId` point at them, and any screen that renders an
 * author name should fall back through `resolveDemoStaff` when the id is not a
 * real user. `isDemoStaffId` exists so that lookup can be attempted without a
 * database round-trip.
 */

export interface DemoStaff {
  id: string
  name: string
  role: Role
  /** Shown next to the name where the UI has room for it. */
  designation: string
}

/** Every seeded staff id starts with this, so they are recognisable anywhere. */
export const DEMO_STAFF_ID_PREFIX = 'DEMO-STAFF-'

export const DEMO_STAFF: Readonly<Record<string, DemoStaff>> = {
  'DEMO-STAFF-HW1': {
    id: 'DEMO-STAFF-HW1',
    name: 'Rosalinda Mercado',
    role: ROLES.HEALTH_WORKER,
    designation: 'Barangay health worker',
  },
  'DEMO-STAFF-HW2': {
    id: 'DEMO-STAFF-HW2',
    name: 'Arnel Dimaculangan',
    role: ROLES.HEALTH_WORKER,
    designation: 'Barangay health worker',
  },
  'DEMO-STAFF-DR1': {
    id: 'DEMO-STAFF-DR1',
    name: 'Dr. Imelda Ocampo',
    role: ROLES.PRACTITIONER,
    designation: 'Pulmonologist',
  },
} as const

export const DEMO_HEALTH_WORKER_A = 'DEMO-STAFF-HW1'
export const DEMO_HEALTH_WORKER_B = 'DEMO-STAFF-HW2'
export const DEMO_PRACTITIONER = 'DEMO-STAFF-DR1'

/** `true` when this id belongs to the fictional clinic rather than a real account. */
export function isDemoStaffId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(DEMO_STAFF_ID_PREFIX)
}

/** The fictional staff member behind an id, or `null` for a real user id. */
export function resolveDemoStaff(id: string | undefined): DemoStaff | null {
  if (id === undefined) return null
  return DEMO_STAFF[id] ?? null
}
