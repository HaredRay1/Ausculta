// audio_capture.h -- jitter-free 16 kHz ADC capture.
//
// Sampling is clocked by the ADC's own hardware and delivered over DMA. No
// analogRead(), no timing in software: the CPU only drains a ring buffer that
// the peripheral has already filled, so an SD card that stalls for a few
// hundred milliseconds costs nothing.
//
// Two backends, selected automatically by Arduino-ESP32 core version:
//   core 3.x  -- ESP-IDF adc_continuous driver
//   core 2.x  -- legacy I2S built-in ADC mode (I2S_MODE_ADC_BUILT_IN)
// Both drive the same peripheral; only the API differs.
#pragma once

#include <stddef.h>
#include <stdint.h>

// Starts sampling. `adcPin` must be an ADC1-capable GPIO (32-39).
// Returns false if the pin is not on ADC1 or the driver refuses to start.
bool audioCaptureBegin(uint32_t sampleRateHz, int adcPin);

// Drains whatever the DMA has ready and converts it to signed 16-bit samples.
// Non-blocking: returns 0 when nothing is queued yet. Never returns more than
// `maxSamples`.
size_t audioCaptureRead(int16_t* out, size_t maxSamples);

// Stops sampling and releases the driver.
void audioCaptureEnd();

// Number of DMA pool overflows since audioCaptureBegin(). Non-zero means the
// writer could not keep up and samples were dropped, which puts a gap in the
// recording's timeline -- worth telling the operator about, because the
// classifier sees it as a click.
uint32_t audioCaptureOverflows();

// "adc_continuous" or "i2s-adc", for the boot banner.
const char* audioCaptureBackendName();

// Current DC idle-point estimate in ADC counts. Diagnostics only: a healthy
// mic module with the gain pot mid-travel should sit somewhere near 2048.
int16_t audioCaptureBiasCounts();
