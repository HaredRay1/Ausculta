import { useNavigate } from 'react-router-dom'
import {
  Banner,
  Button,
  Card,
  DisclaimerBanner,
  EmptyState,
  InboxIcon,
  Section,
} from '../../../components'
import { PatientScreen } from '../components/PatientScreen'
import type { PatientRepository } from '../data/patientRepository'
import { usePatientTranslation } from '../i18n'

/**
 * Rehabilitation support — the shell, deliberately without content.
 *
 * The validation form names rehabilitation support in the app's own title, so
 * the feature has to be reachable and has to make sense when a validator finds
 * it. What it must NOT do is invent breathing exercises. Exercise prescriptions
 * are clinical content: the wrong one given to the wrong person is a safety
 * event, and a pulmonologist scores patient safety on exactly this screen. A
 * separate task fills this in from a cited clinical source.
 *
 * So the empty state does three things instead of dead-ending: it says a
 * practitioner has not assigned a plan, it says why the app will not choose one
 * on its own, and it says how to get one.
 */

export interface RehabPageProps {
  repository?: PatientRepository
}

export function RehabPage({ repository }: RehabPageProps) {
  const { t } = usePatientTranslation()
  const navigate = useNavigate()

  return (
    <PatientScreen
      activeId="rehab"
      title={t('patient:rehab.title')}
      {...(repository !== undefined && { repository })}
    >
      {() => (
        <>
          <Section title={t('patient:rehab.heading')}>
            <Card>
              <p className="text-base text-on-surface">{t('patient:rehab.whatItIs')}</p>
            </Card>
          </Section>

          {/*
            The safety page comes first and is reachable whether or not a
            practitioner has assigned anything. What to do during an attack is
            not conditional on having a care plan, and someone who needs it is
            not in a state to go hunting for it.
          */}
          <Section title={t('patient:rehab.safetyTitle')}>
            <Card>
              <p className="text-base text-on-surface">{t('patient:rehab.safetyBody')}</p>
              <div className="mt-4">
                <Button variant="primary" fullWidth onClick={() => navigate('/rehab/safety')}>
                  {t('patient:rehab.safetyAction')}
                </Button>
              </div>
            </Card>
          </Section>

          <EmptyState
            title={t('patient:rehab.empty.title')}
            body={t('patient:rehab.empty.body')}
            icon={<InboxIcon className="size-10" />}
            action={
              <Button variant="secondary" fullWidth onClick={() => navigate('/rehab')}>
                {t('patient:rehab.openProgramme')}
              </Button>
            }
          />

          <Banner tone="info">{t('patient:rehab.askNote')}</Banner>

          <DisclaimerBanner />
        </>
      )}
    </PatientScreen>
  )
}
