import { CheckCircleIcon, MicIcon, QuestionIcon, WarningIcon, type IconComponent } from '../icons'

/**
 * The four things Ausculta is allowed to say about a recording.
 *
 * Note what is absent: there is no "normal", no "healthy", no disease name, and
 * nothing that reads as a conclusion about the person rather than about the
 * recording. The app is a screening aid whose primary reader is a patient with
 * asthma and no medical training, working through the app unaided — so the
 * vocabulary is deliberately narrow, and every state's wording is fixed in the
 * `design` translation namespace rather than passed in by the calling screen.
 *
 * Codes are uppercase to match the project's clinical code registry
 * convention (see src/db/codes.ts), though these live here: they describe the
 * presentation of a result, not a stored clinical value.
 */
export const RESULT_VERDICTS = {
  /** Something worth a closer look. A flag, never a diagnosis. */
  SUGGESTIVE: 'SUGGESTIVE',
  /** Nothing unusual heard. Always paired with "does not rule out illness". */
  NO_ABNORMALITY_DETECTED: 'NO_ABNORMALITY_DETECTED',
  /** The model could not tell. Explicitly not good news and not bad news. */
  UNCERTAIN: 'UNCERTAIN',
  /** The audio was unusable. Nothing was decided about the person at all. */
  INSUFFICIENT_QUALITY: 'INSUFFICIENT_QUALITY',
} as const

export type ResultVerdict = (typeof RESULT_VERDICTS)[keyof typeof RESULT_VERDICTS]

export interface VerdictPresentation {
  icon: IconComponent
  /** Wash, ink and border for the card and the pill. */
  surface: string
  /** The icon's own colour, which must carry against `surface`. */
  iconClass: string
}

/**
 * How each verdict looks.
 *
 * `SUGGESTIVE` is amber, never red. It is a screening flag on a research
 * prototype, and red is the colour of an emergency — overstating it would push
 * a patient towards alarm on evidence that does not support it, which is the
 * exact failure mode a pulmonologist scoring patient safety looks for.
 *
 * `NO_ABNORMALITY_DETECTED` is a muted green rather than a triumphant one, for
 * the mirror-image reason: it must not read as an all-clear.
 *
 * The two states that mean "no answer" are deliberately colourless. Giving them
 * a hue would imply a verdict they do not carry.
 */
export const VERDICT_PRESENTATION: Record<ResultVerdict, VerdictPresentation> = {
  [RESULT_VERDICTS.SUGGESTIVE]: {
    icon: WarningIcon,
    surface: 'bg-warning-surface text-on-warning-surface border-warning',
    iconClass: 'text-warning',
  },
  [RESULT_VERDICTS.NO_ABNORMALITY_DETECTED]: {
    icon: CheckCircleIcon,
    surface: 'bg-success-surface text-on-success-surface border-success',
    iconClass: 'text-success',
  },
  [RESULT_VERDICTS.UNCERTAIN]: {
    icon: QuestionIcon,
    surface: 'bg-nested text-on-surface border-border-strong',
    iconClass: 'text-muted',
  },
  [RESULT_VERDICTS.INSUFFICIENT_QUALITY]: {
    icon: MicIcon,
    surface: 'bg-nested text-on-surface border-border-strong',
    iconClass: 'text-muted',
  },
}

/** Translation key for a verdict's short title. */
export function verdictTitleKey(verdict: ResultVerdict): string {
  return `result.${verdict}.title`
}

/** Translation key for a verdict's mandatory explanatory body. */
export function verdictBodyKey(verdict: ResultVerdict): string {
  return `result.${verdict}.body`
}
