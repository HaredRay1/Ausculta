// ausculta_recorder.ino -- Ausculta smart stethoscope field recorder.
//
// Press the button to start recording, press again to stop. Audio lands on the
// SD card as AUSCnnnn.WAV: 16 kHz, mono, signed 16-bit PCM -- exactly the format
// the Edge Impulse respiratory classifier is trained on. See WAV_FORMAT.md.
//
// Structure:
//   config.h        every pin and tunable, in one block
//   audio_capture   DMA-clocked 16 kHz ADC capture
//   pcm             12-bit unsigned -> signed 16-bit, with DC bias tracking
//   wav_writer      streaming RIFF/WAVE with in-place size patching
//   filename        AUSCnnnn.WAV sequencing
//   storage         SD mount, free-space guard, SD-backed sink
//   ui              LCD, status LED, debounced button
//
// Capture runs on the ADC's own clock via DMA and the card writes happen in a
// task pinned to core 0, so neither the LCD nor a stalling SD card can disturb
// sample timing.

#include <Arduino.h>

#include "audio_capture.h"
#include "config.h"
#include "filename.h"
#include "storage.h"
#include "ui.h"
#include "wav_writer.h"

enum AppState {
  APP_BOOT = 0,
  APP_READY,
  APP_RECORDING,
  APP_SAVED,
  APP_ERROR,
};

namespace {

// Written by the recorder task, read by loop(). Guarded by g_lock.
struct Status {
  AppState state = APP_BOOT;
  char fileName[AUSC_NAME_BUFFER] = {0};
  uint32_t samples = 0;
  uint32_t overflows = 0;
  char error[LCD_COLUMNS + 1] = {0};
};

Status g_status;
portMUX_TYPE g_lock = portMUX_INITIALIZER_UNLOCKED;

volatile bool g_startRequested = false;
volatile bool g_stopRequested = false;

// Audio staging. File scope rather than task stack: 2 KB does not belong on a
// FreeRTOS stack.
int16_t g_block[AUDIO_WRITE_BLOCK_SAMPLES];

Status readStatus() {
  portENTER_CRITICAL(&g_lock);
  Status copy = g_status;
  portEXIT_CRITICAL(&g_lock);
  return copy;
}

void setState(AppState state, const char* error = nullptr) {
  portENTER_CRITICAL(&g_lock);
  g_status.state = state;
  if (error != nullptr) {
    strncpy(g_status.error, error, LCD_COLUMNS);
    g_status.error[LCD_COLUMNS] = 0;
  }
  portEXIT_CRITICAL(&g_lock);
}

void setProgress(uint32_t samples, uint32_t overflows) {
  portENTER_CRITICAL(&g_lock);
  g_status.samples = samples;
  g_status.overflows = overflows;
  portEXIT_CRITICAL(&g_lock);
}

void setFileName(const char* name) {
  portENTER_CRITICAL(&g_lock);
  memcpy(g_status.fileName, name, AUSC_NAME_BUFFER);
  portEXIT_CRITICAL(&g_lock);
}

const char* storageStatusText(StorageStatus status) {
  switch (status) {
    case STORAGE_NO_CARD: return "No SD card";
    case STORAGE_FULL: return "Card full";
    case STORAGE_SEQUENCE_EXHAUSTED: return "Name seq full";
    case STORAGE_OPEN_FAILED: return "Open failed";
    default: return "Storage error";
  }
}

// ---------------------------------------------------------------------------
// Recorder task -- owns the writer and the capture driver
// ---------------------------------------------------------------------------

WavWriter g_writer;
bool g_recording = false;
uint32_t g_lastSyncMs = 0;

bool startRecording() {
  char name[AUSC_NAME_BUFFER];

  // File first, capture second: creating a file can take tens of milliseconds
  // and there is no reason to have samples piling up in the ring while it does.
  const StorageStatus opened = storageOpenNext(name);
  if (opened != STORAGE_OK) {
    setState(APP_ERROR, storageStatusText(opened));
    return false;
  }

  if (!g_writer.begin(storageSink(), AUDIO_SAMPLE_RATE_HZ)) {
    storageCloseFile();
    setState(APP_ERROR, "Header write err");
    return false;
  }

  if (!audioCaptureBegin(AUDIO_SAMPLE_RATE_HZ, PIN_MIC_OUT)) {
    g_writer.end();
    storageCloseFile();
    setState(APP_ERROR, "Mic init failed");
    return false;
  }

  setFileName(name);
  setProgress(0, 0);
  setState(APP_RECORDING);
  g_lastSyncMs = millis();
  g_recording = true;

  Serial.printf("[rec] started %s\n", name);
  return true;
}

void stopRecording(bool writeFailed) {
  // Drain whatever the DMA still holds before tearing the driver down, so the
  // tail of the recording is not thrown away. Bounded so a wedged driver cannot
  // hang the stop.
  const uint32_t drainDeadline = millis() + 100;
  while (!writeFailed && millis() < drainDeadline) {
    const size_t got = audioCaptureRead(g_block, AUDIO_WRITE_BLOCK_SAMPLES);
    if (got == 0) break;
    if (!g_writer.writeSamples(g_block, got)) {
      writeFailed = true;
      break;
    }
  }

  const uint32_t overflows = audioCaptureOverflows();
  audioCaptureEnd();

  const bool ended = g_writer.end();
  const uint32_t samples = g_writer.sampleCount();
  storageCloseFile();
  g_recording = false;

  setProgress(samples, overflows);

  if (writeFailed || !ended) {
    // The header was still patched, so whatever reached the card stays
    // playable -- the operator is told, rather than handed a silent truncation.
    Serial.printf("[rec] write failure; salvaged %lu samples\n",
                  (unsigned long)samples);
    setState(APP_ERROR, "SD write failed");
    return;
  }

  Serial.printf("[rec] stopped, %lu samples (%lu s), %lu overflows\n",
                (unsigned long)samples,
                (unsigned long)(samples / AUDIO_SAMPLE_RATE_HZ),
                (unsigned long)overflows);
  setState(APP_SAVED);
}

void recorderTask(void*) {
  for (;;) {
    if (!g_recording) {
      if (g_startRequested) {
        g_startRequested = false;
        g_stopRequested = false;
        startRecording();
      }
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    const size_t got = audioCaptureRead(g_block, AUDIO_WRITE_BLOCK_SAMPLES);
    if (got > 0) {
      if (!g_writer.writeSamples(g_block, got)) {
        stopRecording(true);
        continue;
      }
      setProgress(g_writer.sampleCount(), audioCaptureOverflows());
    }

    const uint32_t now = millis();
    if ((now - g_lastSyncMs) >= AUDIO_SYNC_INTERVAL_MS) {
      g_lastSyncMs = now;
      // Patches the header to cover everything written so far, so a battery
      // pulled right now costs at most this interval.
      if (!g_writer.sync()) {
        stopRecording(true);
        continue;
      }
    }

    if (g_stopRequested || g_writer.sampleCount() >= AUDIO_MAX_SAMPLES) {
      g_stopRequested = false;
      stopRecording(false);
      continue;
    }

    if (got == 0) vTaskDelay(pdMS_TO_TICKS(2));
  }
}

// ---------------------------------------------------------------------------
// Foreground: UI
// ---------------------------------------------------------------------------

uint32_t g_lastScreenMs = 0;
uint32_t g_savedShownAtMs = 0;
AppState g_lastDrawn = APP_BOOT;

void mountStorageAndReport() {
  const StorageStatus mounted = storageBegin();
  if (mounted != STORAGE_OK) {
    setState(APP_ERROR, storageStatusText(mounted));
    return;
  }
  Serial.printf("[sd] mounted, %llu MB free, next index %u\n",
                (unsigned long long)(storageFreeBytes() / (1024ULL * 1024ULL)),
                (unsigned)storageNextIndex());
  setState(APP_READY);
}

void drawScreen(const Status& status, bool force) {
  const uint32_t now = millis();
  if (!force && (now - g_lastScreenMs) < 250) return;
  g_lastScreenMs = now;

  switch (status.state) {
    case APP_READY:
      uiSetLed(LED_PATTERN_OFF);
      uiShowReady(storageNextIndex());
      break;
    case APP_RECORDING:
      uiSetLed(LED_PATTERN_BLINK_SLOW);
      uiShowRecording(status.fileName, status.samples / AUDIO_SAMPLE_RATE_HZ);
      break;
    case APP_SAVED:
      uiSetLed(LED_PATTERN_SOLID);
      uiShowSaved(status.fileName, status.samples / AUDIO_SAMPLE_RATE_HZ,
                  status.overflows > 0);
      break;
    case APP_ERROR:
      uiSetLed(LED_PATTERN_BLINK_FAST);
      uiShowError(status.error);
      break;
    default:
      uiSetLed(LED_PATTERN_OFF);
      uiShowBoot();
      break;
  }
}

}  // namespace

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(200);
  Serial.println();
  Serial.println(F("Ausculta recorder"));
  Serial.printf("capture backend: %s @ %d Hz on GPIO%d\n",
                audioCaptureBackendName(), AUDIO_SAMPLE_RATE_HZ, PIN_MIC_OUT);

  uiBegin();
  uiShowBoot();

  mountStorageAndReport();

  xTaskCreatePinnedToCore(recorderTask, "recorder", 8192, nullptr,
                          configMAX_PRIORITIES - 3, nullptr,
                          /* core */ 0);  // core 1 runs loop(); keep them apart

  drawScreen(readStatus(), true);
}

void loop() {
  uiTick();

  const Status status = readStatus();

  if (uiTakeButtonPress()) {
    switch (status.state) {
      case APP_READY:
      case APP_SAVED:
        g_startRequested = true;
        break;
      case APP_RECORDING:
        g_stopRequested = true;
        break;
      case APP_ERROR:
        // A press on an error screen retries: the usual cause is a card that
        // was not seated, and the fix is to seat it and press again.
        mountStorageAndReport();
        break;
      default:
        break;
    }
  }

  // Hold the "Saved" screen briefly, then fall back to Ready.
  if (status.state == APP_SAVED) {
    if (g_savedShownAtMs == 0) g_savedShownAtMs = millis();
    if (millis() - g_savedShownAtMs > 3000) {
      g_savedShownAtMs = 0;
      setState(APP_READY);
    }
  } else {
    g_savedShownAtMs = 0;
  }

  const bool changed = (status.state != g_lastDrawn);
  g_lastDrawn = status.state;
  drawScreen(status, changed);

  delay(10);
}
