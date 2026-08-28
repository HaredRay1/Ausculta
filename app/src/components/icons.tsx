import type { ReactNode, SVGProps } from 'react'

/**
 * The icon set.
 *
 * Inline SVG only — no emoji (which render as someone else's artwork at
 * someone else's size, and are read aloud with unpredictable names) and no icon
 * CDN (the app must work with no network).
 *
 * Every icon is built by the same factory, on a 24x24 grid with a 1.75 stroke
 * and round joins, so consistency is structural rather than a thing to
 * remember. `currentColor` means an icon always matches the text it sits with,
 * which is what keeps them legible after a theme swap.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /**
   * Accessible name. Provide it only when the icon carries meaning on its own;
   * an icon sitting beside its own label is decorative and stays hidden from
   * assistive technology.
   */
  title?: string
}

export type IconComponent = (props: IconProps) => ReactNode

function makeIcon(displayName: string, paths: ReactNode): IconComponent {
  function Icon({ title, className, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className ?? 'size-6'}
        // Decorative unless it was given a name; then it is an image with one.
        aria-hidden={title === undefined ? true : undefined}
        role={title === undefined ? undefined : 'img'}
        focusable="false"
        {...rest}
      >
        {title !== undefined && <title>{title}</title>}
        {paths}
      </svg>
    )
  }
  Icon.displayName = displayName
  return Icon
}

/* ---- Status ------------------------------------------------------------- */

export const InfoIcon = makeIcon(
  'InfoIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.75h.01" />
  </>,
)

export const CheckCircleIcon = makeIcon(
  'CheckCircleIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </>,
)

export const WarningIcon = makeIcon(
  'WarningIcon',
  <>
    <path d="M10.6 3.8 2.7 17.4A1.6 1.6 0 0 0 4.1 20h15.8a1.6 1.6 0 0 0 1.4-2.6L13.4 3.8a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M12 9.5v4" />
    <path d="M12 16.75h.01" />
  </>,
)

export const DangerIcon = makeIcon(
  'DangerIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-6 6" />
    <path d="M9 9l6 6" />
  </>,
)

export const QuestionIcon = makeIcon(
  'QuestionIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
    <path d="M12 16.75h.01" />
  </>,
)

/* ---- Navigation and controls -------------------------------------------- */

export const CloseIcon = makeIcon(
  'CloseIcon',
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </>,
)

export const ChevronLeftIcon = makeIcon('ChevronLeftIcon', <path d="M14.5 5 8 12l6.5 7" />)
export const ChevronDownIcon = makeIcon('ChevronDownIcon', <path d="M5 9.5 12 16l7-6.5" />)
export const ChevronRightIcon = makeIcon('ChevronRightIcon', <path d="M9.5 5 16 12l-6.5 7" />)
export const CheckIcon = makeIcon('CheckIcon', <path d="M5 12.5 9.5 17 19 7" />)

export const RefreshIcon = makeIcon(
  'RefreshIcon',
  <>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4.5h-4.5" />
  </>,
)

/* ---- Clinical ----------------------------------------------------------- */

export const LungsIcon = makeIcon(
  'LungsIcon',
  <>
    <path d="M12 3v9" />
    <path d="M12 8c0-1.5-1-2.5-2.4-2.5S7 6.7 7 8.5c0 2.4-1.2 3.9-2.4 5.1A3.7 3.7 0 0 0 3.5 16v2.4A2.6 2.6 0 0 0 6.1 21h1.3A2.6 2.6 0 0 0 10 18.4V12" />
    <path d="M12 8c0-1.5 1-2.5 2.4-2.5S17 6.7 17 8.5c0 2.4 1.2 3.9 2.4 5.1a3.7 3.7 0 0 1 1.1 2.4v2.4A2.6 2.6 0 0 1 17.9 21h-1.3A2.6 2.6 0 0 1 14 18.4V12" />
  </>,
)

export const MicIcon = makeIcon(
  'MicIcon',
  <>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </>,
)

/** Manual entry — a value a person typed in. */
export const HandIcon = makeIcon(
  'HandIcon',
  <>
    <path d="M9 11V4.6a1.6 1.6 0 0 1 3.2 0V11" />
    <path d="M12.2 10.4V5.9a1.6 1.6 0 0 1 3.2 0V12" />
    <path d="M15.4 11.4V8.4a1.6 1.6 0 0 1 3.1 0v6.1a6.5 6.5 0 0 1-6.5 6.5h-1a5.5 5.5 0 0 1-4.6-2.5l-2.2-3.4a1.6 1.6 0 0 1 2.5-2l1.3 1.4" />
    <path d="M9 11V8.9a1.6 1.6 0 0 0-3.2 0v4" />
  </>,
)

/** Device-derived — a value the hardware or the model produced. */
export const ChipIcon = makeIcon(
  'ChipIcon',
  <>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </>,
)

/** Demo mode — records that are invented, not from a real patient. */
export const FlaskIcon = makeIcon(
  'FlaskIcon',
  <>
    <path d="M9.5 3v6.2L4.6 17.6A2 2 0 0 0 6.3 20.7h11.4a2 2 0 0 0 1.7-3.1L14.5 9.2V3" />
    <path d="M8.5 3h7" />
    <path d="M7.2 14.5h9.6" />
  </>,
)

/** A capability that genuinely does not exist yet. */
export const UnavailableIcon = makeIcon(
  'UnavailableIcon',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.6 5.6l12.8 12.8" />
  </>,
)

export const SignalOffIcon = makeIcon(
  'SignalOffIcon',
  <>
    <path d="M3 3l18 18" />
    <path d="M5 12.5a10 10 0 0 1 3.2-2.2" />
    <path d="M2 8.8A15 15 0 0 1 6.5 6" />
    <path d="M19 12.5a10 10 0 0 0-4.6-2.7" />
    <path d="M22 8.8A15 15 0 0 0 12 5c-.6 0-1.2 0-1.8.1" />
    <path d="M8.8 16.3a5 5 0 0 1 6.4 0" />
    <path d="M12 20h.01" />
  </>,
)

/* ---- Generic ------------------------------------------------------------ */

export const SearchIcon = makeIcon(
  'SearchIcon',
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
)

export const InboxIcon = makeIcon(
  'InboxIcon',
  <>
    <path d="M3.5 13.5h4l1.3 2.4h6.4l1.3-2.4h4" />
    <path d="M5.8 4.5h12.4l2.3 9v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4Z" />
  </>,
)

export const HomeIcon = makeIcon(
  'HomeIcon',
  <>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.8V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.8" />
  </>,
)

export const PeopleIcon = makeIcon(
  'PeopleIcon',
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6" />
    <path d="M17.5 14.6A6 6 0 0 1 21 20" />
  </>,
)

export const SettingsIcon = makeIcon(
  'SettingsIcon',
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
  </>,
)

/** Registry for the gallery. Not for app code — import the icon you need. */
export const ALL_ICONS: Readonly<Record<string, IconComponent>> = {
  InfoIcon,
  CheckCircleIcon,
  WarningIcon,
  DangerIcon,
  QuestionIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  RefreshIcon,
  LungsIcon,
  MicIcon,
  HandIcon,
  ChipIcon,
  FlaskIcon,
  UnavailableIcon,
  SignalOffIcon,
  SearchIcon,
  InboxIcon,
  HomeIcon,
  PeopleIcon,
  SettingsIcon,
}
