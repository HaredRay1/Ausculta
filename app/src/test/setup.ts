import '@testing-library/jest-dom/vitest'
// Provides a real (in-memory) IndexedDB implementation under jsdom, which has
// none — Dexie needs this to open a database at all in the test environment.
import 'fake-indexeddb/auto'
