#include "storage.h"

#include <Arduino.h>
#include <SD.h>
#include <SPI.h>

#include "config.h"

namespace {

// WavSink backed by an SD file.
//
// The append position is tracked here rather than read back from the file,
// because the writer interleaves appends with header patches at offset 0 and
// asking the filesystem where it is after every seek would cost throughput.
class SdFileSink : public WavSink {
 public:
  bool open(const char* path) {
    file_ = SD.open(path, FILE_WRITE);
    end_ = 0;
    pos_ = 0;
    return (bool)file_;
  }

  void close() {
    if (file_) {
      file_.flush();
      file_.close();
    }
  }

  bool isOpen() const { return (bool)file_; }

  bool append(const uint8_t* data, size_t len) override {
    if (!file_) return false;
    if (pos_ != end_) {
      if (!file_.seek(end_)) return false;
      pos_ = end_;
    }
    if (file_.write(data, len) != len) return false;
    end_ += (uint32_t)len;
    pos_ = end_;
    return true;
  }

  bool patch(uint32_t offset, const uint8_t* data, size_t len) override {
    if (!file_) return false;
    if (!file_.seek(offset)) return false;
    pos_ = offset;
    if (file_.write(data, len) != len) return false;
    pos_ += (uint32_t)len;
    return true;
  }

  bool sync() override {
    if (!file_) return false;
    file_.flush();
    return true;
  }

 private:
  File file_;
  uint32_t end_ = 0;
  uint32_t pos_ = 0;
};

SdFileSink g_sink;
bool g_mounted = false;
uint16_t g_highestIndex = 0;

// Walks the root directory and returns the highest AUSCnnnn index present, so
// a card that already holds recordings is never written over.
uint16_t scanHighestIndex() {
  uint16_t highest = 0;
  File root = SD.open("/");
  if (!root) return 0;

  for (File entry = root.openNextFile(); entry; entry = root.openNextFile()) {
    if (!entry.isDirectory()) {
      const uint16_t index = auscIndexFromName(entry.name());
      if (index > highest) highest = index;
    }
    entry.close();
  }
  root.close();
  return highest;
}

}  // namespace

StorageStatus storageBegin() {
  g_mounted = false;
  g_highestIndex = 0;

  SPI.begin(PIN_SD_SCK, PIN_SD_MISO, PIN_SD_MOSI, PIN_SD_CS);
  if (!SD.begin(PIN_SD_CS, SPI, SD_SPI_HZ)) return STORAGE_NO_CARD;
  if (SD.cardType() == CARD_NONE) {
    SD.end();
    return STORAGE_NO_CARD;
  }

  g_mounted = true;
  g_highestIndex = scanHighestIndex();
  return STORAGE_OK;
}

bool storageMounted() { return g_mounted; }

uint16_t storageNextIndex() { return auscNextIndex(g_highestIndex); }

uint64_t storageFreeBytes() {
  if (!g_mounted) return 0;
  const uint64_t total = SD.totalBytes();
  const uint64_t used = SD.usedBytes();
  return (total > used) ? (total - used) : 0;
}

uint64_t storageTotalBytes() { return g_mounted ? SD.totalBytes() : 0; }

StorageStatus storageOpenNext(char* nameOut) {
  if (!g_mounted) return STORAGE_NO_CARD;

  const uint16_t index = auscNextIndex(g_highestIndex);
  if (index == 0) return STORAGE_SEQUENCE_EXHAUSTED;

  // Refuse to start rather than fill the card and abort partway: a recording
  // the operator believes succeeded is worse than one that never began.
  const uint64_t needed =
      (uint64_t)AUDIO_MAX_DATA_BYTES + WAV_HEADER_BYTES + SD_FREE_SLACK_BYTES;
  if (storageFreeBytes() < needed) return STORAGE_FULL;

  char name[AUSC_NAME_BUFFER];
  if (!auscFilenameForIndex(index, name)) return STORAGE_SEQUENCE_EXHAUSTED;

  char path[AUSC_NAME_BUFFER + 1];
  path[0] = '/';
  memcpy(path + 1, name, AUSC_NAME_BUFFER);

  // The boot scan should have ruled this out, but a card swapped in while
  // powered would not have been scanned.
  if (SD.exists(path)) {
    g_highestIndex = index;
    return STORAGE_OPEN_FAILED;
  }

  if (!g_sink.open(path)) return STORAGE_OPEN_FAILED;

  memcpy(nameOut, name, AUSC_NAME_BUFFER);
  return STORAGE_OK;
}

WavSink* storageSink() { return g_sink.isOpen() ? &g_sink : nullptr; }

void storageCloseFile() {
  if (!g_sink.isOpen()) return;
  g_sink.close();
  const uint16_t index = auscNextIndex(g_highestIndex);
  if (index != 0) g_highestIndex = index;
}
