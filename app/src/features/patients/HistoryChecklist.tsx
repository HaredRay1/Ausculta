import { Checkbox, Section } from '../../components'
import { usePatientsTranslation } from './i18n'
import { toggleTicked, type HistoryAnswerState } from './historyAnswers'

export interface HistoryChecklistProps {
  title: string
  description: string
  /** Codes in the order they should be asked. */
  codes: readonly string[]
  /** Namespace inside `codes.json` holding the display strings. */
  codeNamespace: 'respiratoryHistory' | 'familyHistory'
  value: HistoryAnswerState
  onChange: (next: HistoryAnswerState) => void
}

/**
 * A history section: a checklist plus the "I asked every question" control.
 *
 * The second control is what lets an unticked box mean "answered no" rather
 * than "never asked" — see historyAnswers.ts for why that distinction is
 * worth an extra checkbox.
 */
export function HistoryChecklist({
  title,
  description,
  codes,
  codeNamespace,
  value,
  onChange,
}: HistoryChecklistProps) {
  const { t } = usePatientsTranslation()

  return (
    <Section title={title} description={description}>
      <div className="flex flex-col gap-1">
        {codes.map((code) => (
          <Checkbox
            key={code}
            label={t(`codes:${codeNamespace}.${code}`)}
            checked={value.ticked.includes(code)}
            onChange={() => onChange(toggleTicked(value, code))}
          />
        ))}
      </div>

      <div className="mt-3 border-t-2 border-border pt-3">
        <Checkbox
          label={t('register.askedAll')}
          hint={t('register.askedAllHint')}
          checked={value.askedAll}
          onChange={(askedAll) => onChange({ ...value, askedAll })}
        />
      </div>
    </Section>
  )
}
