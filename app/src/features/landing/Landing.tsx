import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  ChevronRightIcon,
  DisclaimerBanner,
  IconTile,
  InfoIcon,
  LungsIcon,
  QuestionIcon,
  SettingsIcon,
  type TileTone,
} from '../../components'

/**
 * The front door.
 *
 * The first version put a small mark and a title in the middle of a tall empty
 * page with a stack of underlined links at the bottom, and read as a title page
 * rather than an app. Three things changed.
 *
 * The mark leads, at a size that carries: a teal band with the lungs glyph in a
 * disc, the wordmark under it, then the sentence that says what the app
 * actually does. A person who has never heard of Ausculta learns what it is in
 * the first screenful.
 *
 * The secondary destinations are rows with icons and chevrons, not a column of
 * underlined text. Four underlined links stacked centrally is what a sitemap
 * looks like; rows are what a phone looks like.
 *
 * And the layout no longer uses `justify-between`, which on a tall phone pushed
 * several hundred pixels of nothing between the brand and the button. Content
 * flows from the top with a consistent rhythm.
 *
 * The rhythm is then tuned against a real 390x844 screenshot rather than
 * guessed: at the roomier spacing the page ran about 915px and the fold cut
 * straight through "Research prototype -- not a medical device". That line is
 * the app's stated identity in the validation instruments, so it earns the
 * ~70px this trim takes off the brand band, not the other way round.
 */

interface SecondaryLink {
  to: string
  labelKey: string
  icon: typeof LungsIcon
  tone: TileTone
}

const SECONDARY: readonly SecondaryLink[] = [
  { to: '/help', labelKey: 'help_link', icon: QuestionIcon, tone: 'tone-2' },
  { to: '/status', labelKey: 'systemStatus.title', icon: InfoIcon, tone: 'tone-4' },
  /*
   * Demo data normally seeds itself on first launch. This is the recovery path
   * when it did not — an empty app with no visible way to populate it is the
   * worst state to hand someone evaluating it.
   */
  { to: '/demo', labelKey: 'demoData', icon: LungsIcon, tone: 'tone-3' },
  { to: '/language', labelKey: 'changeLanguage', icon: SettingsIcon, tone: 'tone-5' },
]

export function Landing() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <main className="min-h-dvh bg-surface pb-8">
      {/* The brand band: the mark at a size that reads as identity. */}
      <section className="px-6 pb-6 pt-12 text-center">
        {/*
          The brand mark is drawn here rather than through IconTile on purpose.
          Passing a size in className would have been overriding IconTile's own
          size utility and relying on which one Tailwind happens to emit last --
          the same trap the elevation utilities exist to avoid. This is a
          one-off hero, not a list-row tile, so it owns its own box.
        */}
        <span
          aria-hidden="true"
          className="mx-auto mb-4 inline-flex size-20 items-center justify-center rounded-[1.75rem] bg-accent text-on-accent"
        >
          <LungsIcon className="size-12" />
        </span>
        <h1 className="font-heading text-[2.1rem] font-bold uppercase tracking-[0.18em] text-on-surface">
          {t('appName')}
        </h1>
        <p className="mt-2 text-base font-medium text-primary">{t('tagline')}</p>
        <p className="mx-auto mt-4 max-w-xs text-base leading-relaxed text-muted">
          {t('whatItIs')}
        </p>
      </section>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-4 px-5">
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate('/login')}>
          {t('getStarted')}
        </Button>

        <nav aria-label={t('appName')}>
          <ul className="flex flex-col gap-2">
            {SECONDARY.map(({ to, labelKey, icon: Icon, tone }) => (
              <li key={to}>
                <button
                  type="button"
                  onClick={() => navigate(to)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-card border border-card-border bg-surface-raised px-3 text-left transition-colors duration-150 ease-out elevation-1 active:bg-surface-sunken"
                >
                  <IconTile size="sm" tone={tone}>
                    <Icon className="size-5" />
                  </IconTile>
                  <span className="min-w-0 flex-1 text-base font-medium text-on-surface">
                    {t(labelKey)}
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Last, and quieter than the brand. It has to be read and it has to be
          honest, but on the first screen it should not be the loudest thing on
          the page — which it was when it sat directly above the only button.
        */}
        <DisclaimerBanner i18nKey="common:disclaimer" />
      </div>
    </main>
  )
}
