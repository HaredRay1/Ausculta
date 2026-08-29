import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ensureFirstRunDemo } from './features/demo/firstRun'
import { registerHardwareBackButton } from './lib/hardwareBack'
import { i18n } from './i18n'
import { getStoredDeviceLanguage } from './lib/deviceLanguage'
import './index.css'

// Restore a previously chosen device language before first render so the UI
// doesn't flash English before switching.
const storedLanguage = getStoredDeviceLanguage()
if (storedLanguage) {
  void i18n.changeLanguage(storedLanguage)
}

// registerType: 'prompt' — the plugin never auto-activates a new service
// worker. A real update toast comes in a later phase; for now a plain
// window.confirm is enough to unblock offline-first testing.
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('A new version of Ausculta is available. Reload now?')) {
      void updateSW(true)
    }
  },
})

registerHardwareBackButton()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('#root element not found')
}

// Seed fictional data on a device that has never held a real patient, so the app is
// explorable on first launch instead of a wall of empty screens. Declines permanently
// once any real patient exists, and never re-enables after demo mode is switched off.
// Failing to seed must never stop the app from starting.
try {
  await ensureFirstRunDemo()
} catch (error) {
  console.error('First-run demo seeding failed; starting with an empty database.', error)
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
)
