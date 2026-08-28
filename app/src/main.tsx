import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
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

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('#root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
)
