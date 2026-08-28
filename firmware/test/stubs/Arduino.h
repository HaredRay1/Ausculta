// Stub Arduino/ESP32 SDK surface, for host syntax-checking only.
//
// This is NOT a simulator and NOT a substitute for compiling in the Arduino
// IDE. It declares just enough of the API that the firmware's own headers,
// signatures, and control flow can be type-checked by g++ on a PC. It cannot
// catch a mismatch against the *real* SDK -- only the Arduino IDE can do that.
#pragma once

#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define F(s) (s)
#define IRAM_ATTR
#define ESP_INTR_FLAG_LEVEL1 (1 << 1)

// Pretend to be Arduino-ESP32 3.x so the adc_continuous backend is the one
// checked here. Flip to 2 to syntax-check the I2S backend instead.
#ifndef ESP_ARDUINO_VERSION_MAJOR
#define ESP_ARDUINO_VERSION_MAJOR 3
#endif

typedef uint8_t byte;

unsigned long millis();
void delay(unsigned long ms);
void pinMode(int pin, int mode);
void digitalWrite(int pin, int value);
int digitalRead(int pin);

struct SerialStub {
  void begin(unsigned long baud);
  void println();
  void println(const char* s);
  void print(const char* s);
  int printf(const char* fmt, ...);
};
extern SerialStub Serial;

// --- FreeRTOS ---
typedef void* TaskHandle_t;
typedef uint32_t TickType_t;
#define configMAX_PRIORITIES 25
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))
void vTaskDelay(TickType_t ticks);
int xTaskCreatePinnedToCore(void (*fn)(void*), const char* name, uint32_t stack,
                            void* arg, int priority, TaskHandle_t* handle,
                            int core);

typedef struct {
  int dummy;
} portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
void portENTER_CRITICAL(portMUX_TYPE* mux);
void portEXIT_CRITICAL(portMUX_TYPE* mux);

// --- esp_err ---
typedef int esp_err_t;
#define ESP_OK 0
