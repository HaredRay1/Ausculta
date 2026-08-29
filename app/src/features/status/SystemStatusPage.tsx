import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AppBar, Banner, Card, DisclaimerBanner, Page, Section } from '../../components'

/**
 * What is real in this build and what is a placeholder.
 *
 * The master specification requires the app to state which capabilities exist,
 * which are stubbed and which are not connected, rather than presenting a
 * uniform surface that implies everything works. Validators navigate the
 * prototype unaided, so this has to be reachable in the app itself — a document
 * they never open does not stop them reporting an absence we already know about.
 *
 * Keep it honest. A capability moves to `built` only when a user can complete it
 * end to end, not when its screen exists.
 */
type Availability = 'built' | 'partial' | 'notConnected'

interface Capability {
  id: string
  availability: Availability
}

const CAPABILITIES: readonly Capability[] = [
  { id: 'recordingImport', availability: 'built' },
  { id: 'qualityCheck', availability: 'built' },
  { id: 'classification', availability: 'built' },
  { id: 'accounts', availability: 'built' },
  { id: 'patientRecords', availability: 'built' },
  { id: 'consent', availability: 'built' },
  { id: 'practitionerReview', availability: 'built' },
  { id: 'guides', availability: 'built' },
  { id: 'offline', availability: 'built' },
  { id: 'rehabilitation', availability: 'partial' },
  { id: 'trends', availability: 'partial' },
  { id: 'filipino', availability: 'partial' },
  { id: 'severityScore', availability: 'notConnected' },
  { id: 'cloudSync', availability: 'notConnected' },
  { id: 'bluetooth', availability: 'notConnected' },
]

const TONE: Record<Availability, 'success' | 'warning' | 'info'> = {
  built: 'success',
  partial: 'warning',
  notConnected: 'info',
}

export function SystemStatusPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('common')

  const groups: Availability[] = ['built', 'partial', 'notConnected']

  return (
    <Page>
      <AppBar onBack={() => navigate(-1)} title={t('systemStatus.title')} />

      <Section description={t('systemStatus.intro')}>
        <DisclaimerBanner i18nKey="common:disclaimer" />
      </Section>

      <Section title={t('systemStatus.modelHeading')}>
        <Banner tone="warning" title={t('systemStatus.modelTitle')}>
          {t('systemStatus.modelBody')}
        </Banner>
      </Section>

      {groups.map((availability) => (
        <Section key={availability} title={t(`systemStatus.group.${availability}`)}>
          <ul className="flex flex-col gap-3">
            {CAPABILITIES.filter((c) => c.availability === availability).map((capability) => (
              <Card key={capability.id} as="li" padding="md">
                <p className="font-medium text-on-surface">
                  {t(`systemStatus.capability.${capability.id}.name`)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t(`systemStatus.capability.${capability.id}.detail`)}
                </p>
                <p className="mt-2 text-sm font-medium text-on-surface">
                  {t(`systemStatus.status.${availability}`)}
                </p>
              </Card>
            ))}
          </ul>
          {/* Tone is carried by the group heading and the status word, never by
              colour alone — every row states its status in text. */}
          <span className="sr-only">{TONE[availability]}</span>
        </Section>
      ))}

      <Section>
        <Link to="/landing" className="text-primary underline">
          {t('systemStatus.back')}
        </Link>
      </Section>
    </Page>
  )
}
