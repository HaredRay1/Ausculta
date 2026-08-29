import { useState } from 'react'
import { Banner, Button, Card, Section, Select, TextField } from '../../../components'
import type { SymptomCode, SymptomFrequency, SymptomSeverity } from '../../../db/codes'
import type { SymptomEntry } from '../../../db/types'
import { useAssessmentTranslation } from '../i18n'
import {
  FREQUENCY_ORDER,
  SEVERITY_ORDER,
  SYMPTOM_ORDER,
  answeredCount,
  draftErrors,
  fromSymptomEntries,
  toSymptomEntries,
  type SymptomAnswer,
  type SymptomDraft,
} from '../symptoms'

/**
 * Step 2 — what the patient says is wrong.
 *
 * This screen records a report, and only a report. It never groups symptoms
 * into a picture, never scores them, and never hints at what they might add up
 * to: the health worker asking these questions is not making a diagnosis, and a
 * layout that implied one would put a conclusion in the record before anybody
 * has listened to a chest.
 *
 * Every question has three answers, not two. Leaving a row alone means the
 * question was not put to the patient, and that row is simply not stored (see
 * `../symptoms.ts`). Only Yes and No are claims about the person.
 *
 * The whole step is optional. A health worker who has a queue outside and a
 * patient who is short of breath skips it and records the chest.
 */
export interface SymptomsStepProps {
  /** What is already stored, so stepping back shows the answers again. */
  value: readonly SymptomEntry[]
  busy: boolean
  errorKey: string | null
  onContinue: (entries: SymptomEntry[]) => void
  onSkip: () => void
}

/** Rows that arrived with detail open straight away, rather than hidden. */
function initialExpanded(entries: readonly SymptomEntry[]): SymptomCode[] {
  return entries
    .filter(
      (entry) =>
        entry.present &&
        (entry.severityCode !== undefined ||
          entry.durationDays !== undefined ||
          entry.frequencyCode !== undefined ||
          (entry.notes ?? '') !== ''),
    )
    .map((entry) => entry.code)
}

export function SymptomsStep({ value, busy, errorKey, onContinue, onSkip }: SymptomsStepProps) {
  const { t } = useAssessmentTranslation()
  const [draft, setDraft] = useState<SymptomDraft>(() => fromSymptomEntries(value))
  const [expanded, setExpanded] = useState<SymptomCode[]>(() => initialExpanded(value))
  const [showErrors, setShowErrors] = useState(false)

  const errors = draftErrors(draft)
  const answered = answeredCount(draft)

  function update(code: SymptomCode, patch: Partial<SymptomAnswer>) {
    setDraft((current) => ({ ...current, [code]: { ...current[code], ...patch } }))
  }

  function setPresent(code: SymptomCode, present: boolean) {
    update(code, { present })
    // A "yes" is the only answer that has detail to give, so that is the only
    // one that opens the detail fields.
    if (present && !expanded.includes(code)) setExpanded((current) => [...current, code])
  }

  function toggleDetail(code: SymptomCode) {
    setExpanded((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    )
  }

  function submit() {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    onContinue(toSymptomEntries(draft))
  }

  return (
    <Section title={t('symptoms.title')} description={t('symptoms.subtitle')}>
      {errorKey !== null && <Banner tone="danger">{t(errorKey)}</Banner>}

      {/* Says out loud what this screen is not. Symptoms are a report; the
          finding, if there ever is one, comes from a practitioner. */}
      <Banner tone="info">{t('symptoms.reportOnly')}</Banner>

      <p className="text-sm text-muted" aria-live="polite">
        {t('symptoms.progress', { answered, total: SYMPTOM_ORDER.length })}
      </p>

      <Card padding="none">
        <ul className="divide-y divide-border">
          {SYMPTOM_ORDER.map((code) => {
            const answer = draft[code]
            const isOpen = expanded.includes(code)
            const error = showErrors ? errors[code] : undefined

            return (
              <li key={code} className="px-3 py-2">
                <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* The legend names the group for a screen reader; the same
                      words are shown beside it so the row reads as one line on
                      a 360px phone instead of stacking into a card. */}
                  <legend className="sr-only">{t(`codes:symptom.${code}`)}</legend>
                  <span aria-hidden="true" className="min-w-0 flex-1 text-base text-on-surface">
                    {t(`codes:symptom.${code}`)}
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <AnswerButton
                      name={`symptom-${code}`}
                      label={t('symptoms.yes')}
                      checked={answer.present === true}
                      onSelect={() => setPresent(code, true)}
                    />
                    <AnswerButton
                      name={`symptom-${code}`}
                      label={t('symptoms.no')}
                      checked={answer.present === false}
                      onSelect={() => setPresent(code, false)}
                    />
                  </div>
                </fieldset>

                {answer.present === true && (
                  <div className="mt-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleDetail(code)}>
                      {isOpen ? t('symptoms.hideDetail') : t('symptoms.addDetail')}
                    </Button>

                    {isOpen && (
                      <div className="mt-2 flex flex-col gap-3 border-l-2 border-border pl-3">
                        <Select
                          label={t('symptoms.severityLabel')}
                          optionalLabel={t('symptoms.optional')}
                          value={answer.severityCode}
                          onChange={(next) =>
                            update(code, { severityCode: next as SymptomSeverity | '' })
                          }
                          options={[
                            { value: '', label: t('symptoms.notRecorded') },
                            ...SEVERITY_ORDER.map((severity) => ({
                              value: severity,
                              label: t(`codes:symptomSeverity.${severity}`),
                            })),
                          ]}
                        />
                        <TextField
                          label={t('symptoms.durationLabel')}
                          optionalLabel={t('symptoms.optional')}
                          value={answer.durationDays}
                          onChange={(next) => update(code, { durationDays: next })}
                          inputMode="numeric"
                          type="text"
                          {...(error !== undefined && { error: t(error) })}
                        />
                        <Select
                          label={t('symptoms.frequencyLabel')}
                          optionalLabel={t('symptoms.optional')}
                          value={answer.frequencyCode}
                          onChange={(next) =>
                            update(code, { frequencyCode: next as SymptomFrequency | '' })
                          }
                          options={[
                            { value: '', label: t('symptoms.notRecorded') },
                            ...FREQUENCY_ORDER.map((frequency) => ({
                              value: frequency,
                              label: t(`codes:symptomFrequency.${frequency}`),
                            })),
                          ]}
                        />
                        <TextField
                          label={t('symptoms.notesLabel')}
                          optionalLabel={t('symptoms.optional')}
                          value={answer.notes}
                          onChange={(next) => update(code, { notes: next })}
                          hint={t('symptoms.notesHint')}
                        />
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="flex flex-col gap-2">
        <Button onClick={submit} loading={busy} fullWidth size="lg">
          {t('action.continue')}
        </Button>
        {/* Secondary and plainly worded: skipping records nothing, which is a
            different thing from answering "no" to everything. */}
        <Button variant="secondary" onClick={onSkip} disabled={busy} fullWidth>
          {t('symptoms.skip')}
        </Button>
      </div>
    </Section>
  )
}

/**
 * One half of a Yes/No pair.
 *
 * A native radio, so the keyboard, a screen reader and the browser's own
 * grouping all keep working — wrapped in a 48px label so it can be hit with
 * gloves on. Never colour alone: the chosen side carries a thicker border and
 * the radio's own checked mark.
 */
function AnswerButton({
  name,
  label,
  checked,
  onSelect,
}: {
  name: string
  label: string
  checked: boolean
  onSelect: () => void
}) {
  return (
    <label
      className={[
        'flex min-h-12 w-20 cursor-pointer items-center justify-center gap-1.5 rounded-control border-2 px-2',
        checked
          ? 'border-primary-strong bg-accent text-on-accent font-semibold'
          : 'border-border-strong bg-card text-on-surface',
      ].join(' ')}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-5 shrink-0 accent-[var(--color-primary-strong)]"
      />
      <span className="text-base">{label}</span>
    </label>
  )
}
