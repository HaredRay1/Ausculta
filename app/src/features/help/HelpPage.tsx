import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AppBar, Card, DisclaimerBanner, Page, Section } from '../../components'

/**
 * How to use the device, as a standalone page.
 *
 * The instructional diagrams already existed but were only ever shown inside
 * the assessment flow, one at a time, at the moment they applied. Fieldwork
 * asked for built-in training that a health worker can read before a patient is
 * in front of them — and older staff, the nurses said, will not read a manual
 * but will look at pictures. So the whole sequence lives here in order, and the
 * captions are translated text beneath text-free images rather than words baked
 * into the artwork.
 */

const DEVICE_STEPS = [
  'device-01-power-on',
  'device-02-insert-sd',
  'device-03-place-chest',
  'device-04-press-record',
  'device-05-recording',
  'device-06-stop-save',
  'device-07-remove-sd',
  'device-08-import-to-app',
  'device-09-clean',
  'device-10-charge-battery',
] as const

const MISTAKES = [
  'mistake-01-over-clothing',
  'mistake-02-loose-contact',
  'mistake-03-talking-moving',
  'mistake-04-noisy-room',
] as const

interface GuideProps {
  file: string
  caption: string
  /**
   * What the drawing SHOWS, which is not what the caption says.
   *
   * Using the caption as alt text made a screen reader announce the same
   * sentence twice — once for the image, once for the paragraph below it —
   * while telling a blind user nothing about the picture. That matters most on
   * the mistake diagrams, which are two-panel comparisons: without a
   * description, "the tick shows the right way" is meaningless to someone who
   * cannot see the panels.
   */
  alt: string
}

function Guide({ file, caption, alt }: GuideProps) {
  return (
    <Card as="li" padding="md">
      <img
        src={`/guides/${file}.svg`}
        alt={alt}
        className="mx-auto block w-full max-w-xs"
        loading="lazy"
      />
      <p className="mt-3 text-base text-on-surface">{caption}</p>
    </Card>
  )
}

export function HelpPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('common')

  return (
    <Page>
      <AppBar onBack={() => navigate(-1)} title={t('help.title')} />

      <Section description={t('help.intro')}>
        <DisclaimerBanner i18nKey="common:disclaimer" />
      </Section>

      <Section title={t('help.deviceHeading')} description={t('help.deviceIntro')}>
        <ol className="flex flex-col gap-4">
          {DEVICE_STEPS.map((file) => (
            <Guide
              key={file}
              file={file}
              caption={t(`help.device.${file}`)}
              alt={t(`help.deviceAlt.${file}`)}
            />
          ))}
        </ol>
      </Section>

      <Section title={t('help.mistakesHeading')} description={t('help.mistakesIntro')}>
        <ul className="flex flex-col gap-4">
          {MISTAKES.map((file) => (
            <Guide
              key={file}
              file={file}
              caption={t(`help.mistake.${file}`)}
              alt={t(`help.mistakeAlt.${file}`)}
            />
          ))}
        </ul>
      </Section>

      <Section title={t('help.placementHeading')} description={t('help.placementIntro')}>
        <Card>
          <img
            src="/guides/lung-map-overview.svg"
            alt={t('help.placementAlt')}
            className="mx-auto block w-full max-w-xs"
            loading="lazy"
          />
        </Card>
      </Section>

      <Section>
        <Link to="/status" className="text-primary underline">
          {t('systemStatus.title')}
        </Link>
      </Section>
    </Page>
  )
}
