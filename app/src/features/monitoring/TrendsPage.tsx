import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AppBar,
  Banner,
  Card,
  EmptyState,
  InboxIcon,
  WarningIcon,
  NotConnectedPanel,
  Page,
  Section,
  Skeleton,
  SkeletonGroup,
} from '../../components'
import { useAuth } from '../../auth/AuthContext'
import { useMonitoringTranslation } from './i18n'
import { createMonitoringRepository, type Actor, type MonitoringRepository } from './repository'
import { buildTrend, type LocationTrend, type TrendPoint, type TrendResult } from './trend'

export interface TrendsPageProps {
  repository?: MonitoringRepository
}

export function TrendsPage({ repository }: TrendsPageProps = {}) {
  const { t } = useMonitoringTranslation()
  const { patientId = '' } = useParams()
  const { user } = useAuth()

  const repo = useMemo(() => repository ?? createMonitoringRepository(), [repository])
  const actor: Actor | null = user === null ? null : { id: user.id, role: user.role }

  const [trend, setTrend] = useState<TrendResult | null>(null)
  // "No assessments recorded" when the read failed would assert something
  // about this patient's history that has not been established.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (actor === null) return
    let cancelled = false

    repo
      .historyFor(patientId)
      .then((history) => {
        if (!cancelled) setTrend(buildTrend(history))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [patientId, actor?.id, repo])

  if (failed) {
    return (
      <Page>
        <AppBar title={t('trend.title')} />
        <EmptyState
          title={t('trend.loadFailed')}
          body={t('alerts.loadFailedBody')}
          icon={<WarningIcon />}
        />
      </Page>
    )
  }

  if (trend === null) {
    return (
      <Page>
        <AppBar title={t('trend.title')} />
        <SkeletonGroup label={t('trend.loading')}>
          <Skeleton className="h-32 w-full" lines={4} />
        </SkeletonGroup>
      </Page>
    )
  }

  return (
    <Page>
      <AppBar title={t('trend.title')} subtitle={t('trend.subtitle')} />

      {/* Framing first: this is a record of what was reported, not a measure of
          whether the patient is getting better or worse. */}
      <Banner tone="info">{t('trend.observationNote')}</Banner>

      {!trend.ok ? (
        <EmptyState
          title={trend.reason === 'no-data' ? t('trend.none') : t('trend.notEnough')}
          body={trend.reason === 'no-data' ? undefined : t('trend.notEnoughHint')}
          icon={<InboxIcon />}
        />
      ) : (
        <>
          <p className="text-sm text-muted">
            {t('trend.assessmentsCount', { count: trend.assessmentCount })}
          </p>

          <Section title={t('trend.byLocation')}>
            <div className="flex flex-col gap-4">
              {trend.locations.map((location) => (
                <LocationStrip key={location.locationCode} location={location} />
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title={t('trend.severity')}>
        {/* Never a number here. NotConnectedPanel carries no digits and no
            controls, so it cannot read as a value that came back empty. */}
        <NotConnectedPanel title={t('trend.severity')} body={t('trend.severityUnavailableHint')} />
      </Section>
    </Page>
  )
}

/**
 * One location's history as a strip of points.
 *
 * Inline SVG, no charting library. Every point carries a word as well as a
 * shape, and the list beneath the strip is the same data in text — so the strip
 * is never the only way to read it, on a greyscale print or with a screen
 * reader.
 */
function LocationStrip({ location }: { location: LocationTrend }) {
  const { t } = useMonitoringTranslation()
  const locationName = t(`codes:location.${location.locationCode}`)

  if (!location.hasData) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-on-surface">{locationName}</h3>
        <p className="mt-2 text-base text-muted">{t('trend.noDataAt')}</p>
      </Card>
    )
  }

  const width = Math.max(location.points.length * 56, 56)

  return (
    <Card as="article" aria-label={locationName}>
      <h3 className="text-lg font-semibold text-on-surface">{locationName}</h3>

      <div className="mt-3 overflow-x-auto">
        <svg
          width={width}
          height="72"
          role="img"
          aria-label={t('trend.chartLabel', {
            location: locationName,
            count: location.points.length,
          })}
          className="text-on-surface"
        >
          {/* Baseline */}
          <line
            x1="0"
            y1="36"
            x2={width}
            y2="36"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2"
          />
          {location.points.map((point, index) => (
            <PointMark key={point.assessmentId} point={point} index={index} />
          ))}
        </svg>
      </div>

      {/* The same information as text. The strip is an aid, not the record. */}
      <ul className="mt-3 flex flex-col gap-1">
        {location.points.map((point) => (
          <li key={point.assessmentId} className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">
              {new Date(point.date).toLocaleDateString()}
            </span>
            <span className="text-base text-on-surface">{describe(point, t)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function PointMark({ point, index }: { point: TrendPoint; index: number }) {
  const cx = index * 56 + 28

  if (point.flagged === undefined) {
    // A gap: nothing was recorded here, so nothing is drawn. Joining across it
    // would invent continuity that was never recorded.
    return (
      <text x={cx} y="42" textAnchor="middle" fontSize="16" fill="currentColor" opacity="0.35">
        -
      </text>
    )
  }

  if (point.unusable === true) {
    // A hollow square: distinct in shape, not only in colour.
    return (
      <rect
        x={cx - 9}
        y="27"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.5"
      />
    )
  }

  // Colour via currentColor on a wrapping group, matching how icons.tsx paints
  // SVG throughout the app. Shape carries the meaning on its own -- triangle,
  // circle, hollow square, dash -- so the colour is reinforcement, never the
  // only signal.
  return point.flagged ? (
    <g className="text-warning">
      <polygon points={`${cx},24 ${cx + 11},43 ${cx - 11},43`} fill="currentColor" />
    </g>
  ) : (
    <g className="text-success">
      <circle cx={cx} cy="36" r="9" fill="currentColor" />
    </g>
  )
}

function describe(point: TrendPoint, t: (key: string) => string): string {
  if (point.flagged === undefined) return t('trend.noDataAt')
  if (point.unusable === true) return t('trend.qualityUnusable')
  return point.flagged ? t('trend.flagged') : t('trend.notFlagged')
}
