import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppBar, Page } from '../../../components'
import { useRehabTranslation } from '../i18n'
import { REHAB_PATHS } from '../navigation'

export interface RehabScreenProps {
  title: string
  children: ReactNode
  /**
   * Where the back control goes. Defaults to the rehabilitation home; pass
   * `null` on the home screen itself to hide the control.
   */
  backTo?: string | null
  subtitle?: string
}

/**
 * The shell every rehabilitation screen sits in.
 *
 * A labelled back control rather than a bare edge-swipe, because validators
 * navigate this app unaided and a gesture is not discoverable. The back target
 * is a route rather than history, so a person who deep-linked to the safety
 * screen — the most likely link to be shared — still lands somewhere real
 * instead of leaving the app.
 */
export function RehabScreen({ title, children, backTo, subtitle }: RehabScreenProps) {
  const navigate = useNavigate()
  const { t } = useRehabTranslation()
  const target = backTo === undefined ? REHAB_PATHS.home : backTo

  return (
    <>
      <AppBar
        title={title}
        {...(subtitle !== undefined && { subtitle })}
        {...(target !== null && {
          onBack: () => {
            void navigate(target)
          },
          backLabel: t('rehab:nav.home'),
        })}
      />
      <Page>{children}</Page>
    </>
  )
}
