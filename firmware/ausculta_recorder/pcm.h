// pcm.h -- ADC sample conditioning.
//
// Turns the raw 12-bit unsigned readings coming off the ESP32 ADC into the
// signed 16-bit little-endian samples the WAV file carries, and tracks out the
// microphone's DC idle point while it does so.
//
// Pure C++: no Arduino headers, so this compiles and is unit-tested on the host
// (see firmware/test/test_pcm.cpp).
#pragma once

#include <stddef.h>
#include <stdint.h>

// ADC resolution the firmware configures. 12 bits -> readings of 0..4095.
#define PCM_ADC_BITS 12
#define PCM_ADC_MAX ((1 << PCM_ADC_BITS) - 1)

// Left shift applied after bias removal, mapping the 12-bit swing onto the full
// 16-bit range. 4 bits = a gain of exactly 16.
#define PCM_GAIN_SHIFT (16 - PCM_ADC_BITS)

// Time constant of the DC tracker, as a power of two in samples.
//
// 1 << 10 = 1024 samples. At 16 kHz that is 64 ms, which puts the effective
// high-pass corner at 1 / (2*pi*0.064) ~= 2.5 Hz -- far below the ~20 Hz floor
// of heart sounds and the ~100 Hz floor of lung sounds, so the tracker removes
// supply drift without eating the signal. Raising this makes the tracker slower
// and gentler; lowering it starts to attenuate real low-frequency content.
#define PCM_BIAS_SHIFT 10

// Running state of the converter. One instance per recording.
struct PcmConverter {
  int32_t biasAcc;  // bias estimate in Q(PCM_BIAS_SHIFT) fixed point
  bool primed;      // false until the first sample has set the idle point
};

// Clears the converter. The next sample seeds the bias estimate.
void pcmReset(PcmConverter* c);

// Converts one reading. The first call after a reset seeds the idle point and
// returns silence, so a recording never opens with a full-scale DC thump.
int16_t pcmConvertSample(PcmConverter* c, uint16_t raw);

// Block form of pcmConvertSample. `out` must hold `count` samples; `raw` and
// `out` may not overlap.
void pcmConvertBlock(PcmConverter* c, const uint16_t* raw, int16_t* out, size_t count);

// Current idle-point estimate in ADC counts. Diagnostics only.
int16_t pcmBias(const PcmConverter* c);
