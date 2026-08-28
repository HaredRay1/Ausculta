// config.h -- every hardware-dependent constant for the Ausculta recorder.
//
// If you change the wiring, this file is the only place you need to edit.
// Entries marked VERIFY were inferred rather than confirmed against the
// physical board; see firmware/README.md for the reasoning behind each.
#pragma once

// ---------------------------------------------------------------------------
// PIN ASSIGNMENTS
// ---------------------------------------------------------------------------

// Microphone module analog output. Must be an ADC1 channel: ADC2 is unusable
// while WiFi is active and is not reachable by the continuous/DMA ADC driver at
// all. Valid ADC1 pins are 32, 33, 34, 35, 36(VP), 37, 38, 39(VN).
#define PIN_MIC_OUT 32

// Momentary push button, wired to GND. The internal pull-up is enabled, so the
// pin reads HIGH when released and LOW when pressed.
//
// VERIFY: the wiring diagram appears to route the mic to GPIO33 and the button
// to GPIO32 -- the opposite of this. The written hardware spec says the mic is
// on GPIO32, so that is what ships. Both are ADC1 channels, so if the LCD shows
// "Ready" but the button does nothing, swap these two lines and reflash.
#define PIN_BUTTON 33

// Status LED, driven through a series resistor to GND.
//
// VERIFY: the wiring diagram routes the LED to GPIO35, which is an INPUT-ONLY
// pin on the ESP32 and physically cannot drive an LED -- there is no output
// driver on GPIO34-39. Move the LED's resistor lead to GPIO25 (two positions
// down the same header) to match this firmware.
#define PIN_LED 25

// 16x2 I2C LCD. The diagram shows SDA on GPIO22 and SCL on GPIO21, which is the
// reverse of the ESP32 Arduino default. Boot runs an I2C probe on this order
// and, if nothing answers, retries with the two swapped -- so either wiring
// works and the Serial log reports which one was found.
#define PIN_I2C_SDA 22
#define PIN_I2C_SCL 21

// microSD module on the VSPI bus. These are the ESP32 VSPI defaults and match
// the four signal wires in the diagram.
#define PIN_SD_CS 5
#define PIN_SD_SCK 18
#define PIN_SD_MOSI 23
#define PIN_SD_MISO 19

// ---------------------------------------------------------------------------
// AUDIO FORMAT -- a hard contract with the app. See firmware/WAV_FORMAT.md.
// The Edge Impulse classifier is trained at exactly 16 kHz; changing this
// silently breaks inference rather than producing an obvious error.
// ---------------------------------------------------------------------------

#define AUDIO_SAMPLE_RATE_HZ 16000
#define AUDIO_CHANNELS 1
#define AUDIO_BITS_PER_SAMPLE 16

// Hard cap on one recording, so a button press that is never followed by a
// second one cannot fill the card.
#define AUDIO_MAX_SECONDS 120

// ---------------------------------------------------------------------------
// BUFFERING
// ---------------------------------------------------------------------------

// DMA ring the ADC fills in the background. 16 KB = 8192 samples = 512 ms of
// slack at 16 kHz, which is what absorbs an SD card that stalls mid-write.
#define AUDIO_DMA_BUFFER_BYTES 16384
#define AUDIO_DMA_FRAME_BYTES 1024

// Samples pulled from the DMA ring and handed to the WAV writer per pass.
// 1024 samples = 2048 bytes, a comfortable multiple of the SD sector size.
#define AUDIO_WRITE_BLOCK_SAMPLES 1024

// How often the WAV header is patched and the card flushed while recording.
// This is the worst-case data loss if the battery is pulled mid-recording.
#define AUDIO_SYNC_INTERVAL_MS 1000

// ---------------------------------------------------------------------------
// STORAGE
// ---------------------------------------------------------------------------

// SPI clock for the card. 10 MHz is deliberately conservative for breadboard
// jumper wiring; the format needs only 32 kB/s. Raise toward 20-25 MHz only if
// the SD module is on a soldered board and you have verified it stays reliable.
#define SD_SPI_HZ 10000000

// Refuse to start a recording unless the card can hold a full-length one plus
// slack for FAT bookkeeping.
#define SD_FREE_SLACK_BYTES 65536

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

// A press is accepted once the level has been stable for this long.
#define BUTTON_DEBOUNCE_MS 40

#define LED_BLINK_RECORDING_MS 500
#define LED_BLINK_ERROR_MS 100

// Standard PCF8574 backpack addresses. The LCD library probes for these itself;
// they are listed here only so the boot-time I2C scan can report a match.
#define LCD_ADDR_PRIMARY 0x27
#define LCD_ADDR_ALTERNATE 0x3F

#define LCD_COLUMNS 16
#define LCD_ROWS 2

#define SERIAL_BAUD 115200

// ---------------------------------------------------------------------------
// DERIVED -- do not edit
// ---------------------------------------------------------------------------

#define AUDIO_BYTES_PER_SAMPLE (AUDIO_BITS_PER_SAMPLE / 8)
#define AUDIO_MAX_SAMPLES ((uint32_t)AUDIO_SAMPLE_RATE_HZ * AUDIO_MAX_SECONDS)
#define AUDIO_MAX_DATA_BYTES (AUDIO_MAX_SAMPLES * AUDIO_BYTES_PER_SAMPLE)
