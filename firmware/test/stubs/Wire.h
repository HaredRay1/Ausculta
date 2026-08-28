// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>

struct WireStub {
  bool begin(int sda, int scl);
  void end();
  void setClock(uint32_t hz);
  void beginTransmission(uint8_t address);
  uint8_t endTransmission();
};
extern WireStub Wire;
