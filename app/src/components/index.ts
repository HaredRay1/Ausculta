/**
 * The Ausculta design system — public surface.
 *
 * Import everything from here:
 *
 *     import { Button, ResultCard, RESULT_VERDICTS } from '../../components'
 *
 * Two rules for anything built on this:
 *
 * 1. No raw hex and no Tailwind palette classes (`bg-teal-700`, `text-slate-900`)
 *    in a feature component. Use the semantic tokens — `bg-surface`,
 *    `text-on-surface`, `text-muted`, `border-border`, `bg-primary-strong`,
 *    `text-on-primary`, `bg-accent`, and the status families. Dark mode is a
 *    token swap, so a palette class simply will not follow the theme.
 * 2. No meaning carried by colour alone. Every status here already ships an
 *    icon and a word; keep it that way in feature code.
 */

/* ---- Tokens and i18n ---------------------------------------------------- */
export { registerDesignResources, useDesignTranslation, DESIGN_NS } from '../design/i18n'

/* ---- Icons -------------------------------------------------------------- */
export {
  ALL_ICONS,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChipIcon,
  CloseIcon,
  DangerIcon,
  EyeIcon,
  EyeOffIcon,
  ExerciseIcon,
  FlaskIcon,
  HandIcon,
  HomeIcon,
  InboxIcon,
  InfoIcon,
  LungsIcon,
  MicIcon,
  PeopleIcon,
  PersonIcon,
  QuestionIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SignalOffIcon,
  TrendIcon,
  UnavailableIcon,
  WarningIcon,
  type IconComponent,
  type IconProps,
} from './icons'

/* ---- Primitives --------------------------------------------------------- */
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './primitives/Button'
export { Card, type CardPadding, type CardProps } from './primitives/Card'
export { Checkbox, type CheckboxProps } from './primitives/Checkbox'
export {
  FieldShell,
  controlClassName,
  useFieldIds,
  type FieldIds,
  type FieldShellProps,
} from './primitives/Field'
export { PasswordField, type PasswordFieldProps } from './primitives/PasswordField'
export { RadioGroup, type RadioGroupProps, type RadioOption } from './primitives/RadioGroup'
export { Select, type SelectOption, type SelectProps } from './primitives/Select'
export { Switch, type SwitchProps } from './primitives/Switch'
export { TextField, type TextFieldProps } from './primitives/TextField'
export { Textarea, type TextareaProps } from './primitives/Textarea'

/* ---- Layout and navigation ---------------------------------------------- */
export { AppBar, type AppBarProps } from './layout/AppBar'
export {
  BOTTOM_NAV_MAX_ITEMS,
  BottomNav,
  type BottomNavItem,
  type BottomNavProps,
} from './layout/BottomNav'
export { Page, Section, type PageProps, type SectionProps } from './layout/Page'
export { Sheet, type SheetProps, type SheetVariant } from './layout/Sheet'

/* ---- Feedback ----------------------------------------------------------- */
export { Banner, type BannerProps, type BannerTone } from './feedback/Banner'
export { ConfirmDialog, type ConfirmDialogProps } from './feedback/ConfirmDialog'
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState'
export { Skeleton, SkeletonGroup, type SkeletonGroupProps, type SkeletonProps } from './feedback/Skeleton'
export { Spinner, type SpinnerProps } from './feedback/Spinner'
export {
  DEFAULT_TOAST_DURATION_MS,
  ToastProvider,
  useToast,
  type Toast,
  type ToastContextValue,
  type ToastProviderProps,
} from './feedback/Toast'

/* ---- Clinical ----------------------------------------------------------- */
export { AudioPlayer, type AudioPlayerProps } from './clinical/AudioPlayer'
export { ConfidenceBar, type ConfidenceBarProps } from './clinical/ConfidenceBar'
export {
  FictionalDataBanner,
  type FictionalDataBannerProps,
} from './clinical/FictionalDataBanner'
export { NotConnectedPanel, type NotConnectedPanelProps } from './clinical/NotConnectedPanel'
export { ResultCard, type ResultCardProps } from './clinical/ResultCard'
export { SourceBadge, type SourceBadgeProps, type ValueSource } from './clinical/SourceBadge'
export { StatusPill, type StatusPillProps } from './clinical/StatusPill'
export {
  RESULT_VERDICTS,
  VERDICT_PRESENTATION,
  verdictBodyKey,
  verdictTitleKey,
  type ResultVerdict,
  type VerdictPresentation,
} from './clinical/verdict'

/* ---- Standalone --------------------------------------------------------- */
export { DisclaimerBanner } from './DisclaimerBanner'
