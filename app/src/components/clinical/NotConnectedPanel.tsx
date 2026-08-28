import { useDesignTranslation } from '../../design/i18n'
import { UnavailableIcon } from '../icons'

export interface NotConnectedPanelProps {
  /** The capability that does not exist yet, e.g. "Severity score". */
  title: string
  /** Overrides the default explanation. Must not imply the feature works. */
  body?: string
}

/**
 * A capability that genuinely is not built yet.
 *
 * The hard project rule this component exists to enforce: Ausculta must never
 * fabricate a clinical value. Where the severity-score model or cloud sync
 * would eventually put a number, this puts an explicit "No value" instead —
 * not a zero, not a dash that could be mistaken for a reading, and not a
 * greyed-out control that looks like it might do something once tapped.
 *
 * So it is built to read as inert at a glance: a dashed boundary rather than a
 * solid one, muted ink, a struck-through icon, and no interactive element
 * anywhere inside it. An engineer scoring technical feasibility should be able
 * to tell in one look that nothing is being claimed here — and a clinician
 * should never mistake it for a result that came back empty.
 *
 * `role="note"` rather than `status`: this is a standing statement about the
 * software, not an event worth interrupting anyone to announce.
 */
export function NotConnectedPanel({ title, body }: NotConnectedPanelProps) {
  const { t } = useDesignTranslation()

  return (
    <section
      role="note"
      aria-label={`${title}: ${t('notConnected.label')}`}
      className="flex flex-col gap-3 rounded-card border-2 border-dashed border-border-strong bg-surface-sunken p-4 text-muted"
    >
      <div className="flex items-start gap-3">
        <UnavailableIcon className="mt-0.5 size-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg font-bold text-on-surface">{title}</h3>
          <p className="mt-0.5 inline-flex rounded-pill border border-border-strong px-2 py-0.5 text-sm font-semibold">
            {t('notConnected.label')}
          </p>
        </div>
      </div>

      <p className="text-base">{body ?? t('notConnected.body')}</p>

      {/*
       * Stands where a value would go. Spelling out "No value" is the point:
       * an empty space or a placeholder digit both invite the reader to supply
       * a number that does not exist.
       */}
      <p className="rounded-control border border-dashed border-border-strong px-3 py-2 text-center text-base font-semibold">
        {t('notConnected.noValue')}
      </p>
    </section>
  )
}
