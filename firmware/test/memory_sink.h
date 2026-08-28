// In-memory WavSink for host tests. Stands in for the SD card so wav_writer.cpp
// can be exercised byte-for-byte without an ESP32 or a filesystem.
#pragma once

#include <cstdint>
#include <cstring>
#include <vector>

#include "../ausculta_recorder/wav_writer.h"

class MemorySink : public WavSink {
 public:
  std::vector<uint8_t> bytes;
  int syncCount = 0;

  // Fault injection: once this many bytes have been appended, every further
  // append fails. Negative means "never fail".
  long failAfterBytes = -1;
  bool failPatches = false;

  bool append(const uint8_t* data, size_t len) override {
    // A real SD write either lands whole or not at all.
    if (failAfterBytes >= 0 && (long)(bytes.size() + len) > failAfterBytes) return false;
    bytes.insert(bytes.end(), data, data + len);
    return true;
  }

  bool patch(uint32_t offset, const uint8_t* data, size_t len) override {
    if (failPatches) return false;
    if (offset + len > bytes.size()) return false;
    std::memcpy(bytes.data() + offset, data, len);
    return true;
  }

  bool sync() override {
    syncCount++;
    return true;
  }

  uint32_t u32At(size_t offset) const {
    return (uint32_t)bytes[offset] | ((uint32_t)bytes[offset + 1] << 8) |
           ((uint32_t)bytes[offset + 2] << 16) | ((uint32_t)bytes[offset + 3] << 24);
  }

  int16_t i16At(size_t offset) const {
    return (int16_t)((uint16_t)bytes[offset] | ((uint16_t)bytes[offset + 1] << 8));
  }
};
