import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Android's hardware back button.
 *
 * With no listener registered, Capacitor's default for the back button is to
 * close the app. So every press of the one navigation control every Android
 * user reaches for first was exiting Ausculta — from anywhere, without
 * confirmation. That is the opposite of what a back button means.
 *
 * The rule here matches what an Android user expects of any app: back walks
 * the history until there is nowhere left to go, and only then hands over to
 * the system (minimising rather than force-closing, so the app resumes where
 * it was).
 */
export function registerHardwareBackButton(): void {
  if (!Capacitor.isNativePlatform()) return

  void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      void CapacitorApp.minimizeApp()
    }
  })
}
