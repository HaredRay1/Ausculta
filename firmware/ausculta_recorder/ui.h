// ui.h -- LCD, status LED, and debounced button.
//
// Every LCD string is clipped and padded to LCD_COLUMNS so a shorter message
// never leaves fragments of the previous one on the row.
#pragma once

#include <stdint.h>

enum LedPattern {
  LED_PATTERN_OFF = 0,       // idle
  LED_PATTERN_SOLID,         // saving / busy
  LED_PATTERN_BLINK_SLOW,    // recording
  LED_PATTERN_BLINK_FAST,    // error
};

// Brings up the LED, the button, and the LCD. Probes I2C on the configured pin
// order and again with SDA/SCL swapped, so a reversed pair is reported rather
// than silently producing a blank screen.
// Returns false if no LCD answered; the recorder still runs headless.
bool uiBegin();

bool uiLcdPresent();

// I2C address the LCD answered on, or 0 if none was found.
uint8_t uiLcdAddress();

// True if the LCD was found on the swapped pin order rather than the one in
// config.h.
bool uiLcdPinsSwapped();

// Call every pass through loop(): drives LED blinking and button debouncing.
void uiTick();

// True exactly once per debounced press.
bool uiTakeButtonPress();

void uiSetLed(LedPattern pattern);

// Screens.
void uiShowBoot();
void uiShowReady(uint16_t nextIndex);
void uiShowRecording(const char* fileName, uint32_t elapsedSec);
void uiShowSaved(const char* fileName, uint32_t durationSec, bool hadDropouts);
void uiShowError(const char* detail);
