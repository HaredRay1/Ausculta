// Tests for the 12-bit unsigned ADC -> signed 16-bit conversion and the DC
// bias tracker. The mic module idles near mid-rail and that idle point drifts
// with supply voltage and gain-pot position, so the bias has to be measured,
// not assumed to be 2048.
#include "../ausculta_recorder/pcm.h"

#include <cmath>
#include <cstdint>
#include <vector>

#include "test_util.h"

namespace {

// Priming: the very first sample defines the idle point, so it must come out as
// silence rather than as a full-scale thump at the head of every recording.
void testFirstSampleIsSilence() {
  PcmConverter c;
  pcmReset(&c);
  CHECK_EQ(pcmConvertSample(&c, 2048), (int16_t)0);

  PcmConverter c2;
  pcmReset(&c2);
  CHECK_EQ(pcmConvertSample(&c2, 3000), (int16_t)0);  // off-centre idle, still silence
  CHECK_EQ(pcmBias(&c2), (int16_t)3000);
}

void testSteadyMidRailIsSilence() {
  PcmConverter c;
  pcmReset(&c);
  for (int i = 0; i < 1000; i++) {
    CHECK_EQ(pcmConvertSample(&c, 2048), (int16_t)0);
  }
}

// One ADC count must become 16 counts of int16, so the 12-bit range maps onto
// the full 16-bit range.
void testExcursionsScaleBy16() {
  PcmConverter c;
  pcmReset(&c);
  pcmConvertSample(&c, 2048);  // prime

  CHECK_EQ(pcmConvertSample(&c, 2148), (int16_t)1600);   // +100 counts
  CHECK_EQ(pcmConvertSample(&c, 1948), (int16_t)-1600);  // -100 counts
  CHECK_EQ(pcmConvertSample(&c, 2049), (int16_t)16);     // +1 count
}

// A rail-to-rail transient must saturate cleanly instead of wrapping, which
// would turn a loud sound into an inverted spike.
void testClampsAtBothRails() {
  PcmConverter hi;
  pcmReset(&hi);
  pcmConvertSample(&hi, 0);  // prime at the bottom rail
  CHECK_EQ(pcmConvertSample(&hi, 4095), (int16_t)32767);

  PcmConverter lo;
  pcmReset(&lo);
  pcmConvertSample(&lo, 4095);  // prime at the top rail
  CHECK_EQ(pcmConvertSample(&lo, 0), (int16_t)-32768);
}

// A step change in the idle point (supply sag, gain pot nudged) must decay away
// instead of parking the whole recording off-centre.
void testDcOffsetDecaysToSilence() {
  PcmConverter c;
  pcmReset(&c);
  pcmConvertSample(&c, 2048);  // prime at mid-rail

  const int16_t first = pcmConvertSample(&c, 3000);
  CHECK_EQ(first, (int16_t)15232);  // (3000 - 2048) * 16

  int16_t last = first;
  for (int i = 0; i < 8192; i++) {
    last = pcmConvertSample(&c, 3000);
  }
  // Converged to within the 1-LSB truncation floor of the integer EMA.
  CHECK(std::abs((int)last) <= 32);
}

// The flip side of the test above: the blocker must not eat the signal. At
// PCM_BIAS_SHIFT = 10 and 16 kHz the corner sits at ~2.5 Hz, well below the
// ~20 Hz floor of heart sounds, so a 20 Hz tone must survive almost intact.
void testTwentyHertzSurvives() {
  PcmConverter c;
  pcmReset(&c);

  const double kSampleRate = 16000.0;
  const double kToneHz = 20.0;
  const double kAmplitudeCounts = 500.0;
  const int kSamples = 16000;  // one second

  int peak = 0;
  for (int i = 0; i < kSamples; i++) {
    const double kPi = 3.14159265358979323846;
    const double phase = 2.0 * kPi * kToneHz * (double)i / kSampleRate;
    const uint16_t raw = (uint16_t)(2048.0 + kAmplitudeCounts * std::sin(phase));
    const int16_t out = pcmConvertSample(&c, raw);
    if (i > kSamples / 2) {  // measure after the primer settles
      const int mag = std::abs((int)out);
      if (mag > peak) peak = mag;
    }
  }

  const int expected = (int)(kAmplitudeCounts * 16.0);  // 8000
  CHECK(peak > (int)(expected * 0.95));
  CHECK(peak <= 32767);
}

// A 2 kHz tone sits squarely in the wheeze band and must pass untouched.
void testAudioBandPassesUnattenuated() {
  PcmConverter c;
  pcmReset(&c);
  pcmConvertSample(&c, 2048);

  int peak = 0;
  for (int i = 0; i < 4096; i++) {
    const uint16_t raw = (i % 8 < 4) ? 2548 : 1548;  // +/-500 counts, 2 kHz square
    const int16_t out = pcmConvertSample(&c, raw);
    if (i > 2048) {
      const int mag = std::abs((int)out);
      if (mag > peak) peak = mag;
    }
  }
  CHECK(peak > (int)(8000 * 0.95));
}

// The block path is what the firmware actually calls; it must be identical to
// looping the single-sample path.
void testBlockMatchesSingleSample() {
  std::vector<uint16_t> raw;
  for (int i = 0; i < 512; i++) {
    raw.push_back((uint16_t)(2000 + (i * 37) % 300));
  }

  PcmConverter a;
  pcmReset(&a);
  std::vector<int16_t> viaBlock(raw.size());
  pcmConvertBlock(&a, raw.data(), viaBlock.data(), raw.size());

  PcmConverter b;
  pcmReset(&b);
  for (size_t i = 0; i < raw.size(); i++) {
    CHECK_EQ(viaBlock[i], pcmConvertSample(&b, raw[i]));
  }
  CHECK_EQ(pcmBias(&a), pcmBias(&b));
}

// Readings above 12 bits would mean the ADC was misconfigured; mask rather than
// let a stray high bit invert the sample.
void testRawIsMaskedTo12Bits() {
  PcmConverter c;
  pcmReset(&c);
  pcmConvertSample(&c, 2048);
  CHECK_EQ(pcmConvertSample(&c, 0xF800 | 2148), (int16_t)1600);
}

}  // namespace

int main() {
  testFirstSampleIsSilence();
  testSteadyMidRailIsSilence();
  testExcursionsScaleBy16();
  testClampsAtBothRails();
  testDcOffsetDecaysToSilence();
  testTwentyHertzSurvives();
  testAudioBandPassesUnattenuated();
  testBlockMatchesSingleSample();
  testRawIsMaskedTo12Bits();
  return testutil::finish("pcm");
}
