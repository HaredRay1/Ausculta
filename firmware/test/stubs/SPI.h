// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>

struct SPIStub {
  void begin(int sck, int miso, int mosi, int cs);
};
extern SPIStub SPI;
