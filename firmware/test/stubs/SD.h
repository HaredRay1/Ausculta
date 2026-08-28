// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>
#include <SPI.h>

#define FILE_WRITE "w"
#define CARD_NONE 0

class File {
 public:
  operator bool() const;
  size_t write(const uint8_t* buf, size_t len);
  bool seek(uint32_t pos);
  uint32_t size();
  void flush();
  void close();
  const char* name();
  bool isDirectory();
  File openNextFile();
};

struct SDStub {
  bool begin(int cs, SPIStub& spi, uint32_t hz);
  void end();
  int cardType();
  File open(const char* path);
  File open(const char* path, const char* mode);
  bool exists(const char* path);
  uint64_t totalBytes();
  uint64_t usedBytes();
};
extern SDStub SD;
