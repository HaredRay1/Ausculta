import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar,
  Banner,
  Button,
  Card,
  Page,
  Section,
  Select,
  TextField,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import {
  CONSENT_STATUSES,
  FAMILY_HISTORY_CODES,
  RESPIRATORY_HISTORY_CODES,
  SEX_CODES,
  type ConsentStatus,
} from '../../db/codes'
import type { Patient } from '../../db/types'
import { ConsentPanel } from './ConsentPanel'
import { HistoryChecklist } from './HistoryChecklist'
import { DRAFT_EN_CONSENT_VERSION } from './consent'
import { createDraftStore, type DraftStore } from './draft'
import {
  EMPTY_HISTORY_ANSWERS,
  toHistoryEntries,
  type HistoryAnswerState,
} from './historyAnswers'
import { usePatientsTranslation } from './i18n'
import {
  createPatientRepository,
  PatientError,
  type Actor,
  type PatientRepository,
} from './repository'
import { formatPatientIdForDisplay } from './ids'
import type { DemographicsErrors, DemographicsInput } from './validation'

const RESPIRATORY_CODE_LIST = Object.values(RESPIRATORY_HISTORY_CODES)
const FAMILY_CODE_LIST = Object.values(FAMILY_HISTORY_CODES)

/** How long after the last keystroke the draft is written. */
const DRAFT_DEBOUNCE_MS = 600

const EMPTY_DEMOGRAPHICS: DemographicsInput = {
  name: '',
  birthDate: '',
  sex: '',
  address: '',
  contact: '',
}

export interface PatientRegistrationPageProps {
  /** Injected in tests so a page can run against an isolated database. */
  repository?: PatientRepository
  draftStore?: DraftStore
}

export function PatientRegistrationPage({
  repository,
  draftStore,
}: PatientRegistrationPageProps = {}) {
  const { t, i18n } = usePatientsTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createPatientRepository(), [repository])
  const drafts = useMemo(() => draftStore ?? createDraftStore(), [draftStore])

  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [demographics, setDemographics] = useState<DemographicsInput>(EMPTY_DEMOGRAPHICS)
  const [respiratory, setRespiratory] = useState<HistoryAnswerState>(EMPTY_HISTORY_ANSWERS)
  const [family, setFamily] = useState<HistoryAnswerState>(EMPTY_HISTORY_ANSWERS)
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | ''>('')

  const [errors, setErrors] = useState<DemographicsErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Patient | null>(null)
  const [draftRestored, setDraftRestored] = useState(false)

  // Nothing is written to the draft until the stored one has been read, so a
  // slow load cannot overwrite what the user already had.
  const draftLoaded = useRef(false)

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    void drafts.load(actor.id).then((draft) => {
      if (cancelled) return
      if (draft !== undefined) {
        setDemographics({ ...EMPTY_DEMOGRAPHICS, ...draft.demographics })
        setRespiratory({
          ticked: draft.respiratoryHistory.filter((e) => e.present).map((e) => e.code),
          askedAll: draft.respiratoryHistory.length === RESPIRATORY_CODE_LIST.length,
        })
        setFamily({
          ticked: draft.familyHistory.filter((e) => e.present).map((e) => e.code),
          askedAll: draft.familyHistory.length === FAMILY_CODE_LIST.length,
        })
        if (draft.consentStatus !== undefined) setConsentStatus(draft.consentStatus)
        setDraftRestored(true)
      }
      draftLoaded.current = true
    })

    return () => {
      cancelled = true
    }
  }, [actor?.id, drafts])

  useEffect(() => {
    if (actor === null || !draftLoaded.current || created !== null) return

    const handle = setTimeout(() => {
      void drafts.save(actor.id, {
        demographics,
        respiratoryHistory: toHistoryEntries(RESPIRATORY_CODE_LIST, respiratory),
        familyHistory: toHistoryEntries(FAMILY_CODE_LIST, family),
        ...(consentStatus !== '' && { consentStatus }),
        preferredLanguage: i18n.language,
      })
    }, DRAFT_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [actor?.id, demographics, respiratory, family, consentStatus, created, drafts, i18n.language])

  const setField = useCallback((field: keyof DemographicsInput, value: string) => {
    setDemographics((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }, [])

  const discardDraft = useCallback(() => {
    if (actor !== null) void drafts.clear(actor.id)
    setDemographics(EMPTY_DEMOGRAPHICS)
    setRespiratory(EMPTY_HISTORY_ANSWERS)
    setFamily(EMPTY_HISTORY_ANSWERS)
    setConsentStatus('')
    setDraftRestored(false)
  }, [actor?.id, drafts])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (actor === null || saving) return

    setSaving(true)
    setFormError(null)
    setErrors({})

    try {
      const patient = await repo.create(
        {
          demographics,
          preferredLanguage: i18n.language,
          respiratoryHistory: toHistoryEntries(RESPIRATORY_CODE_LIST, respiratory),
          familyHistory: toHistoryEntries(FAMILY_CODE_LIST, family),
          ...(consentStatus !== '' && {
            consent: { status: consentStatus, documentVersion: DRAFT_EN_CONSENT_VERSION },
          }),
        },
        actor,
      )
      await drafts.clear(actor.id)
      setCreated(patient)
    } catch (error) {
      if (error instanceof PatientError) {
        // Field-level codes go under their own field; anything else becomes one
        // message at the top, so an error is never invisible.
        if (error.detail !== undefined && typeof error.detail === 'object') {
          setErrors(error.detail as DemographicsErrors)
          setFormError(t('register.fixErrors'))
        } else {
          setFormError(t(`error.${error.code}`))
        }
      } else {
        setFormError(t('register.failed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const sexOptions = Object.values(SEX_CODES).map((code) => ({
    value: code,
    label: t(`codes:sex.${code}`),
  }))

  const fieldError = (field: keyof DemographicsErrors) => {
    const code = errors[field]
    return code === undefined ? undefined : t(`error.${code}`)
  }

  if (created !== null) {
    return (
      <Page>
        <AppBar title={t('register.savedTitle')} />
        <Card>
          <Banner tone="success" title={t('register.savedTitle')}>
            {t('register.savedBody', { id: formatPatientIdForDisplay(created.id) })}
          </Banner>
          <div className="mt-4 flex flex-col gap-3">
            <Button fullWidth onClick={() => navigate(`/patients/${created.id}`)}>
              {t('register.savedContinue')}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setCreated(null)
                discardDraft()
              }}
            >
              {t('register.savedAnother')}
            </Button>
          </div>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <AppBar title={t('register.title')} onBack={() => navigate('/patients')} />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {draftRestored && (
          <Banner
            tone="info"
            action={
              <Button size="sm" variant="ghost" onClick={discardDraft}>
                {t('register.draftDiscard')}
              </Button>
            }
          >
            {t('register.draftRestored')}
          </Banner>
        )}

        {formError !== null && (
          <Banner tone="danger">
            {formError}
          </Banner>
        )}

        <Section title={t('register.demographics')} description={t('register.demographicsHint')}>
          <div className="flex flex-col gap-4">
            <TextField
              label={t('field.name')}
              hint={t('field.nameHint')}
              value={demographics.name ?? ''}
              onChange={(value) => setField('name', value)}
              error={fieldError('name')}
              required
              autoComplete="off"
            />
            <TextField
              label={t('field.birthDate')}
              hint={t('field.birthDateHint')}
              type="date"
              value={demographics.birthDate ?? ''}
              onChange={(value) => setField('birthDate', value)}
              error={fieldError('birthDate')}
              required
            />
            <Select
              label={t('field.sex')}
              value={demographics.sex ?? ''}
              onChange={(value) => setField('sex', value)}
              options={sexOptions}
              placeholder={t('field.notAsked')}
              error={fieldError('sex')}
              required
            />
            <TextField
              label={t('field.address')}
              hint={t('field.addressHint')}
              optionalLabel={t('field.optional')}
              value={demographics.address ?? ''}
              onChange={(value) => setField('address', value)}
              error={fieldError('address')}
            />
            <TextField
              label={t('field.contact')}
              hint={t('field.contactHint')}
              optionalLabel={t('field.optional')}
              type="tel"
              value={demographics.contact ?? ''}
              onChange={(value) => setField('contact', value)}
              error={fieldError('contact')}
            />
          </div>
        </Section>

        <HistoryChecklist
          title={t('register.respiratory')}
          description={t('register.respiratoryHint')}
          codes={RESPIRATORY_CODE_LIST}
          codeNamespace="respiratoryHistory"
          value={respiratory}
          onChange={setRespiratory}
        />

        <HistoryChecklist
          title={t('register.family')}
          description={t('register.familyHint')}
          codes={FAMILY_CODE_LIST}
          codeNamespace="familyHistory"
          value={family}
          onChange={setFamily}
        />

        <ConsentPanel
          value={consentStatus}
          onChange={setConsentStatus}
          statuses={Object.values(CONSENT_STATUSES)}
        />

        <div className="flex flex-col gap-3 pb-4">
          <Button type="submit" size="lg" fullWidth loading={saving}>
            {saving ? t('register.submitting') : t('register.submit')}
          </Button>
          <Button type="button" variant="ghost" fullWidth onClick={() => navigate('/patients')}>
            {t('register.cancel')}
          </Button>
        </div>
      </form>
    </Page>
  )
}
