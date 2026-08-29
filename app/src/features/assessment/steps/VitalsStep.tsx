import { useState } from 'react'
import { Banner, Button, Card, Section, SourceBadge, TextField } from '../../../components'
import { MEASUREMENT_CODES, MEASUREMENT_SOURCES } from '../../../db/codes'
import type { Measurement } from '../../../db/types'
import { useAssessmentTranslation } from '../i18n'
import {
  VITAL_FIELDS,
  fromMeasurements,
  toMeasurements,
  validateVitals,
  type VitalFieldSpec,
  type VitalsDraft,
} from '../vitals'

/**
 * Step 3 — the vital signs, where there is equipment to measure them.
 *
 * Every box on this screen may be left empty, and the step as a whole may be
 * skipped. The clinics this app is built for frequently have no oximeter, no
 * thermometer and no cuff; an assessment recorded without them is complete, not
 * deficient, and nothing here may stand between a health worker and a submitted
 * record.
 *
 * The ranges refuse the impossible — a temperature of 200, a pulse of 900 —
 * and accept everything a real patient can present with, including the readings
 * that mean someone is very ill. A form that argued with an SpO2 of 78 would
 * simply teach the person holding the oximeter to type something else.
 *
 * The respiratory rate here is the COUNTED one (`RESP_RATE_MANUAL`). The
 * auscultation-derived code is a separate measurement with no validated
 * algorithm behind it yet, so this screen never writes it and never lets a
 * counted rate be replaced by an estimate. See `../vitals.ts`.
 */
export interface VitalsStepProps {
  /** What is already stored, so stepping back shows the readings again. */
  value: readonly Measurement[]
  /** The signed-in user, stamped onto every reading as `enteredBy`. */
  enteredBy: string
  busy: boolean
  errorKey: string | null
  onContinue: (vitals: Measurement[]) => void
  onSkip: () => void
}

const BP_CODES: readonly string[] = [MEASUREMENT_CODES.BP_SYS, MEASUREMENT_CODES.BP_DIA]

export function VitalsStep({
  value,
  enteredBy,
  busy,
  errorKey,
  onContinue,
  onSkip,
}: VitalsStepProps) {
  const { t } = useAssessmentTranslation()
  const [draft, setDraft] = useState<VitalsDraft>(() => fromMeasurements(value))
  const [showErrors, setShowErrors] = useState(false)

  const errors = validateVitals(draft)
  const singleFields = VITAL_FIELDS.filter((field) => !BP_CODES.includes(field.code))
  const bpFields = VITAL_FIELDS.filter((field) => BP_CODES.includes(field.code))

  function set(code: string, next: string) {
    setDraft((current) => ({ ...current, [code]: next }))
  }

  function field(spec: VitalFieldSpec) {
    const raw = draft[spec.code] ?? ''
    const error = showErrors ? errors[spec.code] : undefined
    const recorded = raw.trim() !== '' && errors[spec.code] === undefined

    return (
      <div key={spec.code} className="flex flex-col gap-1.5">
        <TextField
          label={t(`codes:measurement.${spec.code}`)}
          optionalLabel={t('vitals.optional')}
          value={raw}
          onChange={(next) => set(spec.code, next)}
          type="text"
          inputMode={spec.inputMode}
          hint={t('vitals.range', { min: spec.min, max: spec.max, unit: spec.unit })}
          trailing={
            <span className="pr-3 text-base text-muted" aria-hidden="true">
              {spec.unit}
            </span>
          }
          {...(error !== undefined && { error: t(error.key, error.params) })}
        />
        {/* Provenance travels with the value, on the screen as well as in the
            record: a reviewer must never have to guess whether a number was
            measured by a person or produced by the device. */}
        {recorded && <SourceBadge source={MEASUREMENT_SOURCES.MANUAL_ENTRY} className="self-start" />}
      </div>
    )
  }

  function submit() {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    // Stamped at the moment of saving, not at the moment of typing: the record
    // says who entered the reading and when it entered the record.
    onContinue(toMeasurements(draft, { enteredBy, enteredAt: new Date().toISOString() }))
  }

  return (
    <Section title={t('vitals.title')} description={t('vitals.subtitle')}>
      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}

      <Banner tone="info">{t('vitals.allOptional')}</Banner>

      <Card>
        <div className="flex flex-col gap-4">
          {singleFields.map((spec) =>
            spec.code === MEASUREMENT_CODES.RESP_RATE_MANUAL ? (
              <div key={spec.code} className="flex flex-col gap-1.5">
                {field(spec)}
                <p className="text-sm text-muted">{t('vitals.respCountedHint')}</p>
              </div>
            ) : (
              field(spec)
            ),
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-heading text-base font-bold text-on-surface">
          {t('vitals.bloodPressure')}
        </h3>
        <p className="mt-1 text-sm text-muted">{t('vitals.bloodPressureHint')}</p>
        <div className="mt-3 flex flex-col gap-4">{bpFields.map((spec) => field(spec))}</div>
      </Card>

      <div className="flex flex-col gap-2">
        <Button onClick={submit} loading={busy} fullWidth size="lg">
          {t('action.continue')}
        </Button>
        <Button variant="secondary" onClick={onSkip} disabled={busy} fullWidth>
          {t('vitals.skip')}
        </Button>
      </div>
    </Section>
  )
}
