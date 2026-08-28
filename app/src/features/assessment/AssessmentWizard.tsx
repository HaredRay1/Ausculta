import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppBar, Page, Spinner } from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { useAssessmentTranslation } from './i18n'
import { AnalysisStep } from './steps/AnalysisStep'
import { CaptureStep } from './steps/CaptureStep'
import { DeviceGuideStep } from './steps/DeviceGuideStep'
import { LungLocationStep } from './steps/LungLocationStep'
import { NextStep, SubmittedStep } from './steps/NextStep'
import { PatientContextStep } from './steps/PatientContextStep'
import { PlacementGuideStep } from './steps/PlacementGuideStep'
import { QualityCheckStep } from './steps/QualityCheckStep'
import { ResultStep } from './steps/ResultStep'
import { useAssessmentWizard, type WizardDeps } from './useAssessmentWizard'

/**
 * The assessment flow, start to finish.
 *
 * Deliberately thin: it reads the route, hands the state machine to
 * `useAssessmentWizard`, and picks which step component to render. Every screen
 * lives in its own file under `steps/` and knows nothing about the sequence, so
 * neither this file nor any of them grows into the usual wizard sprawl.
 *
 * Two routes reach it. `/assessment/new?patientId=…` starts a fresh
 * assessment; `/assessment/:assessmentId` resumes one, landing on the position
 * picker with the completed positions already marked.
 */
export interface AssessmentWizardProps extends WizardDeps {
  /** Overrides the route parameters. For tests and for embedding. */
  patientId?: string | null
  assessmentId?: string | null
}

export function AssessmentWizard(props: AssessmentWizardProps = {}) {
  const { t } = useAssessmentTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const params = useParams()
  const [search] = useSearchParams()

  const assessmentId = props.assessmentId ?? params.assessmentId ?? null
  const patientId = props.patientId ?? search.get('patientId')

  const wizard = useAssessmentWizard({
    patientId,
    assessmentId,
    actorId: user?.id ?? '',
    interfaceLanguage: user?.preferredLanguage ?? 'en',
    isDemo: 0,
    store: props.store,
    audio: props.audio,
    readSkipGuide: props.readSkipGuide,
    writeSkipGuide: props.writeSkipGuide,
  })

  const { state } = wizard
  const canGoBack = ['deviceGuide', 'location', 'placement', 'capture', 'quality', 'next'].includes(
    state.step,
  )

  return (
    <>
      <AppBar
        title={t('title')}
        {...(canGoBack && { onBack: wizard.goBack, backLabel: t('action.back') })}
      />
      <Page>
        {state.step === 'loading' && <Spinner label={t('patient.loading')} />}

        {state.step === 'patient' && (
          <PatientContextStep
            patientId={state.patientId}
            busy={state.busy}
            errorKey={state.errorKey}
            onStart={() => void wizard.start()}
            onChoosePatient={() => navigate('/patients')}
          />
        )}

        {state.step === 'deviceGuide' && (
          <DeviceGuideStep onFinish={(skip) => void wizard.finishDeviceGuide(skip)} />
        )}

        {state.step === 'location' && (
          <LungLocationStep recorded={state.recordedLocations} onChoose={wizard.chooseLocation} />
        )}

        {state.step === 'placement' && state.locationCode !== null && (
          <PlacementGuideStep
            locationCode={state.locationCode}
            onContinue={wizard.confirmPlacement}
          />
        )}

        {state.step === 'capture' && state.locationCode !== null && (
          <CaptureStep
            locationCode={state.locationCode}
            fileName={state.fileName}
            busy={state.busy}
            importErrorKey={state.importErrorKey}
            onChooseFile={(file) => void wizard.chooseFile(file)}
          />
        )}

        {state.step === 'quality' && state.precheck !== null && (
          <QualityCheckStep
            report={state.precheck.quality}
            errorKey={state.errorKey}
            onAnalyse={() => void wizard.acceptQuality()}
            onRecordAgain={wizard.recordAgain}
          />
        )}

        {state.step === 'analysis' && <AnalysisStep />}

        {state.step === 'result' && state.analysis !== null && state.locationCode !== null && (
          <ResultStep
            analysis={state.analysis}
            locationCode={state.locationCode}
            audioBlob={wizard.importedAudio}
            onRecordAgain={wizard.recordAgain}
            onContinue={wizard.continueFromResult}
          />
        )}

        {state.step === 'next' && (
          <NextStep
            recordedCount={state.recordedLocations.length}
            busy={state.busy}
            errorKey={state.errorKey}
            onRecordAnother={wizard.recordAnother}
            onSubmit={() => void wizard.submit()}
          />
        )}

        {state.step === 'submitted' && <SubmittedStep onDone={() => navigate('/')} />}
      </Page>
    </>
  )
}

export default AssessmentWizard
