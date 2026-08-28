#include "ui.h"

#include <Arduino.h>
#include <Wire.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>
#include <stdio.h>
#include <string.h>

#include "config.h"

namespace {

hd44780_I2Cexp g_lcd;
bool g_lcdPresent = false;
uint8_t g_lcdAddress = 0;
bool g_lcdSwapped = false;

LedPattern g_pattern = LED_PATTERN_OFF;
uint32_t g_ledPhaseStart = 0;
bool g_ledOn = false;

// Button state. The pin is pulled up, so released reads HIGH.
bool g_buttonStable = true;
bool g_buttonLastRaw = true;
uint32_t g_buttonLastChange = 0;
bool g_buttonPressPending = false;

// Writes exactly LCD_COLUMNS characters, so leftovers from a longer previous
// message cannot survive on the row.
void lcdLine(uint8_t row, const char* text) {
  if (!g_lcdPresent) return;

  char padded[LCD_COLUMNS + 1];
  size_t i = 0;
  for (; i < LCD_COLUMNS && text[i] != '\0'; i++) padded[i] = text[i];
  for (; i < LCD_COLUMNS; i++) padded[i] = ' ';
  padded[LCD_COLUMNS] = '\0';

  g_lcd.setCursor(0, row);
  g_lcd.print(padded);
}

// Returns the first I2C address that answers on this pin order, or 0.
uint8_t probeI2cBus(int sdaPin, int sclPin) {
  Wire.end();
  if (!Wire.begin(sdaPin, sclPin)) return 0;
  Wire.setClock(100000);

  for (uint8_t address = 8; address < 120; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) return address;
  }
  return 0;
}

void applyLed(bool on) {
  g_ledOn = on;
  digitalWrite(PIN_LED, on ? HIGH : LOW);
}

}  // namespace

bool uiBegin() {
  pinMode(PIN_LED, OUTPUT);
  applyLed(false);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  g_buttonLastRaw = (digitalRead(PIN_BUTTON) == HIGH);
  g_buttonStable = g_buttonLastRaw;
  g_buttonLastChange = millis();

  g_lcdAddress = probeI2cBus(PIN_I2C_SDA, PIN_I2C_SCL);
  if (g_lcdAddress == 0) {
    // The wiring diagram and the ESP32 default disagree about which pin is
    // which, so try the other way round before giving up.
    g_lcdAddress = probeI2cBus(PIN_I2C_SCL, PIN_I2C_SDA);
    g_lcdSwapped = (g_lcdAddress != 0);
  }

  if (g_lcdAddress == 0) {
    Serial.println(F("[ui] no I2C device found on either pin order; running headless"));
    return false;
  }

  Serial.printf("[ui] I2C device at 0x%02X on SDA=%d SCL=%d%s\n", g_lcdAddress,
                g_lcdSwapped ? PIN_I2C_SCL : PIN_I2C_SDA,
                g_lcdSwapped ? PIN_I2C_SDA : PIN_I2C_SCL,
                g_lcdSwapped ? "  (swapped vs config.h)" : "");

  // hd44780_I2Cexp locates the backpack address and its pin mapping itself;
  // begin() returns 0 on success.
  if (g_lcd.begin(LCD_COLUMNS, LCD_ROWS) != 0) {
    Serial.println(F("[ui] LCD init failed"));
    return false;
  }

  g_lcdPresent = true;
  g_lcd.backlight();
  g_lcd.clear();
  return true;
}

bool uiLcdPresent() { return g_lcdPresent; }
uint8_t uiLcdAddress() { return g_lcdAddress; }
bool uiLcdPinsSwapped() { return g_lcdSwapped; }

void uiSetLed(LedPattern pattern) {
  if (pattern == g_pattern) return;
  g_pattern = pattern;
  g_ledPhaseStart = millis();

  switch (pattern) {
    case LED_PATTERN_OFF: applyLed(false); break;
    case LED_PATTERN_SOLID: applyLed(true); break;
    default: applyLed(true); break;  // start blinks lit, so a press feels instant
  }
}

void uiTick() {
  const uint32_t now = millis();

  // --- LED ---
  uint32_t period = 0;
  if (g_pattern == LED_PATTERN_BLINK_SLOW) period = LED_BLINK_RECORDING_MS;
  if (g_pattern == LED_PATTERN_BLINK_FAST) period = LED_BLINK_ERROR_MS;
  if (period != 0 && (now - g_ledPhaseStart) >= period) {
    g_ledPhaseStart = now;
    applyLed(!g_ledOn);
  }

  // --- Button ---
  const bool raw = (digitalRead(PIN_BUTTON) == HIGH);  // HIGH = released
  if (raw != g_buttonLastRaw) {
    g_buttonLastRaw = raw;
    g_buttonLastChange = now;
  } else if ((now - g_buttonLastChange) >= BUTTON_DEBOUNCE_MS && raw != g_buttonStable) {
    g_buttonStable = raw;
    if (!raw) g_buttonPressPending = true;  // acted on at the press, not release
  }
}

bool uiTakeButtonPress() {
  if (!g_buttonPressPending) return false;
  g_buttonPressPending = false;
  return true;
}

void uiShowBoot() {
  lcdLine(0, "Ausculta");
  lcdLine(1, "Starting...");
}

void uiShowReady(uint16_t nextIndex) {
  char line[LCD_COLUMNS + 1];
  lcdLine(0, "Ausculta  Ready");
  if (nextIndex == 0) {
    lcdLine(1, "Card full");
  } else {
    snprintf(line, sizeof(line), "Next AUSC%04u", (unsigned)nextIndex);
    lcdLine(1, line);
  }
}

void uiShowRecording(const char* fileName, uint32_t elapsedSec) {
  char line[LCD_COLUMNS + 1];
  snprintf(line, sizeof(line), "REC %03us/%us", (unsigned)elapsedSec,
           (unsigned)AUDIO_MAX_SECONDS);
  lcdLine(0, line);
  lcdLine(1, fileName);
}

void uiShowSaved(const char* fileName, uint32_t durationSec, bool hadDropouts) {
  char line[LCD_COLUMNS + 1];
  // The '!' is the operator's cue that the audio has a gap and the recording
  // should be repeated.
  snprintf(line, sizeof(line), "Saved %03us%s", (unsigned)durationSec,
           hadDropouts ? " !" : "");
  lcdLine(0, line);
  lcdLine(1, fileName);
}

void uiShowError(const char* detail) {
  lcdLine(0, "ERROR");
  lcdLine(1, detail);
}
