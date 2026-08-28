#include "wav_writer.h"

namespace {

void putU32(uint8_t* p, uint32_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
  p[2] = (uint8_t)((v >> 16) & 0xFF);
  p[3] = (uint8_t)((v >> 24) & 0xFF);
}

void putU16(uint8_t* p, uint16_t v) {
  p[0] = (uint8_t)(v & 0xFF);
  p[1] = (uint8_t)((v >> 8) & 0xFF);
}

void putTag(uint8_t* p, char a, char b, char c, char d) {
  p[0] = (uint8_t)a;
  p[1] = (uint8_t)b;
  p[2] = (uint8_t)c;
  p[3] = (uint8_t)d;
}

}  // namespace

void wavBuildHeader(uint8_t* out, uint32_t sampleRate, uint16_t channels,
                    uint16_t bitsPerSample, uint32_t dataBytes) {
  const uint16_t blockAlign = (uint16_t)(channels * (bitsPerSample / 8));
  const uint32_t byteRate = sampleRate * blockAlign;

  putTag(out + 0, 'R', 'I', 'F', 'F');
  putU32(out + 4, 36u + dataBytes);  // everything after this field
  putTag(out + 8, 'W', 'A', 'V', 'E');

  putTag(out + 12, 'f', 'm', 't', ' ');
  putU32(out + 16, 16u);  // PCM fmt chunk carries no extension
  putU16(out + 20, 1u);   // WAVE_FORMAT_PCM
  putU16(out + 22, channels);
  putU32(out + 24, sampleRate);
  putU32(out + 28, byteRate);
  putU16(out + 32, blockAlign);
  putU16(out + 34, bitsPerSample);

  putTag(out + 36, 'd', 'a', 't', 'a');
  putU32(out + 40, dataBytes);
}

bool WavWriter::begin(WavSink* sink, uint32_t sampleRate) {
  sink_ = sink;
  sampleRate_ = sampleRate;
  dataBytes_ = 0;
  failed_ = false;
  open_ = false;

  if (sink == nullptr || sampleRate == 0) {
    failed_ = true;
    return false;
  }

  uint8_t header[WAV_HEADER_BYTES];
  wavBuildHeader(header, sampleRate_, 1, 16, 0);
  if (!sink_->append(header, WAV_HEADER_BYTES)) {
    failed_ = true;
    return false;
  }

  open_ = true;
  return true;
}

bool WavWriter::writeSamples(const int16_t* samples, size_t count) {
  if (failed_ || !open_) return false;
  if (samples == nullptr) {
    failed_ = true;
    return false;
  }
  if (count == 0) return true;

  // Pack explicitly rather than casting the caller's buffer: the file is
  // little-endian by specification, not by whatever the host happens to be.
  uint8_t staging[512];
  const size_t maxPerPass = sizeof(staging) / 2;

  size_t done = 0;
  while (done < count) {
    size_t n = count - done;
    if (n > maxPerPass) n = maxPerPass;

    for (size_t i = 0; i < n; i++) {
      const uint16_t v = (uint16_t)samples[done + i];
      staging[i * 2] = (uint8_t)(v & 0xFF);
      staging[i * 2 + 1] = (uint8_t)((v >> 8) & 0xFF);
    }

    if (!sink_->append(staging, n * 2)) {
      failed_ = true;
      return false;
    }
    dataBytes_ += (uint32_t)(n * 2);
    done += n;
  }
  return true;
}

bool WavWriter::patchSizes() {
  uint8_t header[WAV_HEADER_BYTES];
  wavBuildHeader(header, sampleRate_, 1, 16, dataBytes_);
  return sink_->patch(0, header, WAV_HEADER_BYTES);
}

bool WavWriter::sync() {
  if (failed_ || !open_) return false;
  if (!patchSizes() || !sink_->sync()) {
    failed_ = true;
    return false;
  }
  return true;
}

bool WavWriter::end() {
  if (!open_) return false;
  open_ = false;

  // Patch even after a failure: the bytes that did land are still audio, and a
  // correct header is what makes them playable.
  const bool patched = patchSizes();
  const bool synced = sink_->sync();

  if (failed_) return false;
  if (!patched || !synced) {
    failed_ = true;
    return false;
  }
  return true;
}
