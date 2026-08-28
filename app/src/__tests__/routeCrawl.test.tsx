import { cleanup, render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, createRoutesFromChildren, type RouteObject } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppRoutes } from '../router'
import { AuthProvider } from '../auth/AuthContext'
import { authRoutes } from '../auth/routes'
import { createTestAuthService } from '../auth/testing'
import type { AuthService } from '../auth/authService'
import { ROLES, type Role } from '../db/codes'
import { db } from '../db/db'
import { i18n as appI18n } from '../i18n'
import { assessmentRoutes } from '../features/assessment/routes'
import { demoRoutes, seedDemoData, setDemoMode, syncDemoAssignments } from '../features/demo'
import { TECHNIQUES } from '../features/rehab/content/techniques'
import { patientRoutes as patientPortalRoutes } from '../features/patient/routes'
import { patientRoutes as patientManagementRoutes } from '../features/patients/routes'
import { rehabRoutes } from '../features/rehab/routes'
import { reviewRoutes } from '../features/review/routes'

/**
 * A crawl of every route the app actually mounts.
 *
 * The validation protocol has people navigate this prototype unaided, with
 * tasks like "find where you can view your respiratory assessment results". A
 * blank screen, a crash, or a route that renders for one role and vanishes for
 * another is scored as a navigation failure — not as an unbuilt feature. This
 * asserts the weakest useful property, everywhere: whatever you do, you land on
 * something that says something.
 *
 * The route list is read out of `src/router.tsx` itself rather than copied, so
 * a route added later is crawled without anyone remembering to add it here.
 */

/**
 * Pulls the declared routes out of the router component.
 *
 * `AppRoutes` is a plain function returning a `<Routes>` element and uses no
 * hooks, so it can be called directly to inspect what it declares.
 */
function declaredRoutes(): RouteObject[] {
  const element = AppRoutes() as ReactElement<{ children?: React.ReactNode }>
  return createRoutesFromChildren(element.props.children)
}

function collectPaths(routes: RouteObject[], parent = ''): string[] {
  const paths: string[] = []
  for (const route of routes) {
    if (route.path === undefined) continue
    const full = route.path.startsWith('/')
      ? route.path
      : `${parent.replace(/\/$/, '')}/${route.path}`
    if (route.children !== undefined && route.children.length > 0) {
      paths.push(...collectPaths(route.children, full))
    } else {
      paths.push(full)
    }
  }
  return paths
}

const ALL_PATHS = collectPaths(declaredRoutes()).sort()

/** Every feature's exported route table, by the name used in a failure message. */
const FEATURE_ROUTE_TABLES: ReadonlyArray<readonly [string, readonly RouteObject[]]> = [
  ['auth', authRoutes],
  ['patients (clinician)', patientManagementRoutes],
  ['patient portal', patientPortalRoutes],
  ['assessment', assessmentRoutes],
  ['review', reviewRoutes],
  ['demo', demoRoutes],
  ['rehab', rehabRoutes],
]

const PASSWORD = 'crawl-pass-1'
let auth: AuthService
/** Real ids from the seeded fictional clinic, for the `:param` routes. */
const paramValues = new Map<string, string>()
const userIds = new Map<Role, string>()

/** Substitutes `:params` with ids that exist, or a plausible miss when empty. */
function resolvePath(pattern: string, params: Map<string, string>): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => params.get(name) ?? 'no-such-id')
}

beforeAll(async () => {
  auth = createTestAuthService(db)
  const admin = await auth.bootstrapAdmin({ password: PASSWORD, name: 'Crawl Admin' })
  userIds.set(ROLES.ADMIN, admin.id)

  for (const role of [
    ROLES.PATIENT,
    ROLES.PRACTITIONER,
    ROLES.HEALTH_WORKER,
    ROLES.RESEARCHER,
  ] as const) {
    const user = await auth.register({
      username: role.toLowerCase().replace(/_/g, '.'),
      password: PASSWORD,
      role,
      name: `Crawl ${role}`,
    })
    await auth.activateUser({ actingUserId: admin.id, targetUserId: user.id })
    userIds.set(role, user.id)
  }

  // The seeded fictional clinic is what a validator actually sees.
  await seedDemoData(db)
  await setDemoMode(true, db)
  await syncDemoAssignments(db)

  const firstTechnique = TECHNIQUES[0]
  if (firstTechnique !== undefined) {
    paramValues.set('techniqueCode', firstTechnique.code)
  }

  // Only misses produced by the crawl itself should count, not any logged
  // while seeding.
  await db.missingTranslations.clear()

  const patient = await db.patients.toCollection().first()
  const assessment = await db.assessments.toCollection().first()
  if (patient !== undefined) paramValues.set('patientId', patient.id)
  if (assessment !== undefined) {
    paramValues.set('assessmentId', assessment.id)
  }
})

afterEach(cleanup)

/** Signs the given role in, or clears the session for the signed-out case. */
async function setSession(role: Role | null): Promise<void> {
  if (role === null) {
    await auth.logout()
    return
  }
  const username = role === ROLES.ADMIN ? 'admin' : role.toLowerCase().replace(/_/g, '.')
  await auth.login(username, PASSWORD)
}

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={appI18n}>
      <AuthProvider service={auth} idleCheckIntervalMs={60_000}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </I18nextProvider>,
  )
}

/**
 * The bar every route must clear.
 *
 * Deliberately weak: this is not a test of what each screen says, it is a test
 * that no route is a hole. A redirect counts as a pass, because landing on the
 * login screen when signed out is correct behaviour rather than a dead end —
 * what must never happen is landing on nothing.
 */
async function expectSomethingMeaningful(container: HTMLElement, where: string) {
  // Both checks live inside the same wait. Guards render a one-line "checking
  // your sign-in" state first, which clears the text assertion instantly — so
  // asserting structure afterwards would test the loading screen and never the
  // screen itself.
  await waitFor(
    () => {
      const settled = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
      expect(settled.length, `${where}: rendered no text at all`).toBeGreaterThan(15)
      // Structure, not just characters: a heading, a landmark, or something to
      // act on. A bare sentence floating in a div is not a screen.
      expect(
        container.querySelector(
          'h1, h2, h3, button, a, [role="alert"], [role="status"], [role="note"]',
        ),
        `${where}: rendered text but nothing structural`,
      ).not.toBeNull()
    },
    { timeout: 4000 },
  )

  const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()

  // A missing key renders as the key itself, so a namespaced key in the
  // visible text means a lookup failed in front of the user.
  expect(
    text,
    `${where}: an untranslated i18n key reached the screen`,
  ).not.toMatch(/(?:common|codes|auth|design|patient|assessment|demo|review|rehab|status):[A-Za-z0-9_]+\.[A-Za-z0-9_.]+/)

  // Values that leaked instead of being formatted or guarded.
  expect(text, `${where}: leaked an undefined value into the page`).not.toMatch(/\bundefined\b/)
  expect(text, `${where}: leaked NaN into the page`).not.toMatch(/\bNaN\b/)
  expect(text, `${where}: leaked [object Object] into the page`).not.toContain('[object Object]')
}

const ROLE_CASES: ReadonlyArray<readonly [string, Role | null]> = [
  ['signed out', null],
  ['patient', ROLES.PATIENT],
  ['practitioner', ROLES.PRACTITIONER],
  ['health worker', ROLES.HEALTH_WORKER],
  ['researcher', ROLES.RESEARCHER],
  ['admin', ROLES.ADMIN],
]

describe('route coverage', () => {
  it('mounts every route that a feature exports', () => {
    const mounted = new Set(ALL_PATHS)
    const unmounted = FEATURE_ROUTE_TABLES.flatMap(([feature, routes]) =>
      routes
        .filter((route) => route.path !== undefined && !mounted.has(route.path))
        .map((route) => `${feature}: ${route.path}`),
    )

    // A feature whose routes are built, exported and never mounted is dead
    // code that nobody can reach and no other test would notice.
    expect(unmounted).toEqual([])
  })

  it('finds a non-trivial number of routes to crawl', () => {
    expect(ALL_PATHS.length).toBeGreaterThan(15)
  })

  it('resolves ids for every parameterised route from the seeded clinic', () => {
    const params = [...new Set(ALL_PATHS.flatMap((p) => [...p.matchAll(/:(\w+)/g)].map((m) => m[1])))]
    const unresolved = params.filter((name) => !paramValues.has(name))

    // An unresolved param means the crawl would visit that route with a
    // nonsense id and prove nothing about its real behaviour.
    expect(unresolved).toEqual([])
  })
})

describe.each(ROLE_CASES)('crawl as %s, seeded database', (roleName, role) => {
  it.each(ALL_PATHS)('%s renders something meaningful', async (pattern) => {
    await setSession(role)
    const { container } = renderAt(resolvePath(pattern, paramValues))

    await expectSomethingMeaningful(container, `${pattern} as ${roleName}`)
  })
})

/**
 * The same crawl with nothing in the database.
 *
 * Empty states have to teach rather than dead-end: a patient who has had no
 * assessment yet, and a health worker on a device with no patients, must still
 * land on a screen that explains itself. This is also the state a validator
 * meets if demo seeding fails on their device.
 */
describe.each(ROLE_CASES)('crawl as %s, empty database', (roleName, role) => {
  it.each(ALL_PATHS)('%s renders something meaningful', async (pattern) => {
    await setSession(role)
    // Ids that no longer resolve — the "record not found" path, which must
    // explain itself rather than render blank.
    const { container } = renderAt(resolvePath(pattern, new Map()))

    await expectSomethingMeaningful(container, `${pattern} as ${roleName} (empty)`)
  })
})

/**
 * Every translation key the crawl actually rendered.
 *
 * The app already records missing keys to `missingTranslations` on every miss
 * (see i18n/index.ts, `saveMissing`). Because the crawl above renders every
 * route in every role against that same i18next instance, the table afterwards
 * is a complete list of keys the app asked for and did not have — across the
 * whole product, from one assertion.
 *
 * This declares last on purpose: vitest runs a file's blocks in order, so by
 * the time it reads the table every route has been visited.
 *
 * What it cannot catch: a key that exists but says the wrong thing. A symptom
 * marked absent rendering "no practitioner has reviewed this yet" is a valid
 * lookup and is invisible here, to the type checker, and to the codes
 * exhaustiveness test. That class needs someone to read the screen.
 */
describe('translation coverage', () => {
  /**
   * Lookups that are *meant* to miss.
   *
   * i18next calls its missing-key handler even when the call site supplied a
   * `defaultValue`, so an optional string logs a miss while rendering nothing.
   * `Provenance.tsx` reads an optional note per citation that way, and only one
   * citation has one — so five entries here are correct behaviour, not defects.
   */
  const OPTIONAL_LOOKUPS = /^en: rehab:citation\.[A-Z0-9_]+\.note$/

  it('asked for no key the app does not have, on any route', async () => {
    const missing = await db.missingTranslations.toArray()
    const unexpected = missing
      .map((row) => `${row.language}: ${row.key}`)
      .filter((entry) => !OPTIONAL_LOOKUPS.test(entry))
      .sort()

    // The crawl rendered every route in every role against the app's own
    // i18next instance, which records each miss — so this is the whole
    // product's missing-key list in one assertion.
    //
    // What it cannot catch: a key that exists and says the wrong thing. A
    // symptom marked absent rendering "no practitioner has reviewed this yet"
    // is a valid lookup, and is invisible here, to the type checker and to the
    // codes exhaustiveness test. That class needs someone to read the screen.
    expect(unexpected).toEqual([])
  })
})
