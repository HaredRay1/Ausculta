#include "pcm.h"

void pcmReset(PcmConverter* c) {
  c->biasAcc = 0;
  c->primed = false;
}

int16_t pcmBias(const PcmConverter* c) {
  return (int16_t)(c->biasAcc >> PCM_BIAS_SHIFT);
}

int16_t pcmConvertSample(PcmConverter* c, uint16_t raw) {
  // Mask defensively: a reading wider than 12 bits means the ADC was set up
  // wrong, and letting a stray high bit through would invert the sample.
  const int32_t sample = (int32_t)(raw & PCM_ADC_MAX);

  if (!c->primed) {
    c->biasAcc = sample << PCM_BIAS_SHIFT;
    c->primed = true;
    return 0;
  }

  const int32_t bias = c->biasAcc >> PCM_BIAS_SHIFT;
  const int32_t centered = sample - bias;

  // Single-pole EMA: acc += x - (acc >> shift). Converges on the mean of the
  // input, which for a microphone is its DC idle point.
  c->biasAcc += centered;

  int32_t scaled = centered << PCM_GAIN_SHIFT;
  // A rail-to-rail transient can exceed int16 once the bias has drifted off
  // mid-rail. Saturate, because wrapping would turn a loud sound into an
  // inverted spike that the classifier would see as a click.
  if (scaled > 32767) scaled = 32767;
  if (scaled < -32768) scaled = -32768;
  return (int16_t)scaled;
}

void pcmConvertBlock(PcmConverter* c, const uint16_t* raw, int16_t* out, size_t count) {
  for (size_t i = 0; i < count; i++) {
    out[i] = pcmConvertSample(c, raw[i]);
  }
}
