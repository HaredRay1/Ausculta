// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>

class hd44780 {
 public:
  int begin(int cols, int rows);
  void clear();
  void backlight();
  void setCursor(int col, int row);
  void print(const char* s);
};
