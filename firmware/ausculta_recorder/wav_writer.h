// wav_writer.h -- streaming RIFF/WAVE writer.
//
// The header is written up front with zero sizes, PCM is streamed straight
// behind it, and the size fields are patched in place -- not only on stop but
// on every periodic sync. That is what makes a yanked battery cost the last
// second of audio instead of the whole file: whatever is on the card always
// has a header that already describes it.
//
// Pure C++: no Arduino headers. The firmware supplies an SD-backed WavSink;
// the host tests supply a memory-backed one (test_wav_writer.cpp).
#pragma once

#include <stddef.h>
#include <stdint.h>

// Canonical PCM header: RIFF + fmt (16 bytes) + data, with no extra chunks.
#define WAV_HEADER_BYTES 44

// Renders the 44-byte header. `out` must hold WAV_HEADER_BYTES.
// See firmware/WAV_FORMAT.md for the field-by-field layout this produces.
void wavBuildHeader(uint8_t* out, uint32_t sampleRate, uint16_t channels,
                    uint16_t bitsPerSample, uint32_t dataBytes);

// Byte destination for the writer.
class WavSink {
 public:
  virtual ~WavSink() {}

  // Appends at the end of the stream. Must write all of `len` or fail.
  virtual bool append(const uint8_t* data, size_t len) = 0;

  // Overwrites `len` bytes at absolute `offset` and leaves the append position
  // back at the end of the stream.
  virtual bool patch(uint32_t offset, const uint8_t* data, size_t len) = 0;

  // Pushes buffered bytes down to the medium.
  virtual bool sync() = 0;
};

class WavWriter {
 public:
  // Writes the provisional header, so the file parses even if the device dies
  // before the first sample arrives.
  bool begin(WavSink* sink, uint32_t sampleRate);

  // Appends samples as little-endian int16, regardless of host byte order.
  bool writeSamples(const int16_t* samples, size_t count);

  // Patches the size fields to cover everything written so far, then flushes.
  bool sync();

  // Final patch and flush. Returns false if any write failed along the way,
  // but still patches the header so the salvageable audio stays playable.
  bool end();

  uint32_t dataBytes() const { return dataBytes_; }
  uint32_t sampleCount() const { return dataBytes_ / 2; }

  // Sticky: once a write fails the writer refuses further work, so the header
  // can never end up describing bytes that are not on the card.
  bool failed() const { return failed_; }

 private:
  bool patchSizes();

  WavSink* sink_ = nullptr;
  uint32_t sampleRate_ = 0;
  uint32_t dataBytes_ = 0;
  bool failed_ = false;
  bool open_ = false;
};
