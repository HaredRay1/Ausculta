# Ausculta recorder firmware

ESP32 firmware for the Ausculta smart stethoscope. Press the button to start
recording, press again to stop; audio lands on the SD card as `AUSCnnnn.WAV` —
16 kHz, mono, signed 16-bit PCM, the exact format the Edge Impulse respiratory
classifier expects. The byte-level contract is in [`WAV_FORMAT.md`](WAV_FORMAT.md).

```
firmware/
  ausculta_recorder/
    ausculta_recorder.ino   state machine, button handling, recorder task
    config.h                every pin and tunable, in one block
    audio_capture.{h,cpp}   DMA-clocked 16 kHz ADC capture
    pcm.{h,cpp}             12-bit unsigned -> signed 16-bit, DC bias tracking
    wav_writer.{h,cpp}      streaming RIFF/WAVE with in-place size patching
    filename.{h,cpp}        AUSCnnnn.WAV sequencing
    storage.{h,cpp}         SD mount, free-space guard, SD-backed sink
    ui.{h,cpp}              LCD, status LED, debounced button
  test/                     host tests -- see "Testing" below
```

## Wiring

| ESP32 pin | Component | Notes |
|---|---|---|
| **GPIO32** | Mic module `OUT` | ADC1_CH4. Must be an ADC1 pin (32–39) |
| **GPIO33** | Push button | other leg to GND; internal pull-up is enabled |
| **GPIO25** | LED anode via resistor | cathode to GND — **see caveat 1** |
| **GPIO22** | LCD `SDA` | **see caveat 3** |
| **GPIO21** | LCD `SCL` | **see caveat 3** |
| **GPIO5** | SD `CS` | VSPI default |
| **GPIO18** | SD `SCK` | VSPI default |
| **GPIO23** | SD `MOSI` | VSPI default |
| **GPIO19** | SD `MISO` | VSPI default |
| **3V3** | Mic `VCC`, LCD `VCC`, SD `VCC` | **see caveat 6** |
| **GND** | all modules | single common ground |
| **VIN** | boost converter `OUT+` | 5 V from the Li-ion boost stage |

Every one of these lives in `config.h`. That is the only file to edit if the
wiring changes.

## Required software

| Item | Version | Source |
|---|---|---|
| Arduino IDE | 2.x | arduino.cc |
| `esp32` board package | 3.x (2.0.x also supported) | Boards Manager, "esp32 by Espressif Systems" |
| `hd44780` | 1.3.x | Library Manager, "hd44780 by Bill Perry" |
| `SD`, `SPI`, `Wire` | bundled | ships with the esp32 core |

`hd44780` is the only external library. It was chosen over `LiquidCrystal_I2C`
because it probes for the backpack's I2C address (`0x27` vs `0x3F`) and its
internal pin mapping automatically — two things that vary between otherwise
identical-looking modules and are tedious to diagnose blind.

The firmware supports **both** major esp32 core versions and picks the capture
backend automatically from `ESP_ARDUINO_VERSION_MAJOR`:

- **core 3.x** → ESP-IDF `adc_continuous` driver
- **core 2.x** → legacy I2S built-in ADC (`I2S_MODE_ADC_BUILT_IN`)

Both are DMA-driven off the ADC's own clock. Neither uses `analogRead()`, which
cannot hold 16 kHz without jitter. The active backend is printed to serial at
boot.

## Board settings

Arduino IDE → Tools:

| Setting | Value |
|---|---|
| Board | ESP32 Dev Module |
| Upload Speed | 921600 |
| CPU Frequency | 240 MHz (WiFi/BT) |
| Flash Frequency | 80 MHz |
| Flash Mode | QIO |
| Flash Size | 4 MB (32Mb) |
| Partition Scheme | Default 4MB with spiffs |
| PSRAM | Disabled |
| Core Debug Level | None |

## Build and flash

Open `firmware/ausculta_recorder/ausculta_recorder.ino` in the Arduino IDE
(the folder name must keep matching the `.ino` name), pick the port, and upload.

With `arduino-cli`:

```sh
arduino-cli core install esp32:esp32
arduino-cli lib install "hd44780"
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/ausculta_recorder
arduino-cli upload  --fqbn esp32:esp32:esp32 -p COM5 firmware/ausculta_recorder
```

Then open the serial monitor at **115200** baud. The boot banner reports the
capture backend, the I2C address the LCD answered on and whether SDA/SCL came
back swapped, the free space on the card, and the next filename in the sequence.
If something is miswired, that banner is where it shows up first.

## Using it

| LED | LCD | Meaning |
|---|---|---|
| off | `Ausculta  Ready` / `Next AUSC0007` | idle, ready to record |
| slow blink (0.5 s) | `REC 012s/120s` / `AUSC0007.WAV` | recording |
| solid | `Saved 012s` / `AUSC0007.WAV` | just saved, returns to Ready after 3 s |
| fast blink (0.1 s) | `ERROR` / detail | see below |

Error text is one of `No SD card`, `Card full`, `SD write failed`,
`Mic init failed`, `Open failed`, `Name seq full`. Pressing the button on an
error screen retries the card mount — the usual cause is a card that was not
seated properly.

A `!` after the duration on the Saved screen means the SD card could not keep up
and samples were dropped. The file is still valid, but it has a gap in it and
the recording should be repeated.

Guard rails: a recording stops automatically at 120 s; the device refuses to
start unless the card has room for a full-length one; and the header is patched
once a second so a pulled battery costs at most the last second of audio.

## Getting the recordings off the card

Power the device off, take the microSD card out, and read it in a computer. The
files are in the card root, named `AUSC0001.WAV` upward. Because the numbers are
zero-padded, sorting by filename gives you chronological order.

There is no wireless transfer and no USB mass-storage mode — the card is the
only way off the device. The card must be **FAT32** (the ESP32 `SD` library does
not mount exFAT), which in practice means 32 GB or smaller, or a larger card
deliberately formatted as FAT32.

## Testing

Everything that does not need the physical board is checked on the host:

```sh
bash firmware/test/run_tests.sh        # or: pwsh firmware/test/run_tests.ps1
```

Needs only `g++` and `python` — no Arduino toolchain. Three layers:

1. **Unit tests** for the modules with no Arduino dependency: `pcm`,
   `wav_writer`, `filename`. The 44 header bytes are asserted literally, the
   DC tracker is checked for both convergence *and* for not attenuating a 20 Hz
   tone, and the filename mapping is round-tripped across the whole 1–9999 range.
2. **End-to-end**: `make_sample_wav` drives the real `pcm.cpp` and
   `wav_writer.cpp` to produce actual `.wav` files, which `verify_wav.py` then
   parses using Python's standard-library `wave` module — a reader nobody here
   wrote. It covers both a clean stop and a simulated power loss.
3. **Syntax check** of the Arduino-side sources against stub SDK headers in
   `test/stubs/`, for both the 3.x and 2.x capture backends.

### What that does and does not prove

Verified on the host: the WAV byte layout, the ADC→PCM conversion and its
filter behaviour, filename sequencing, crash-truncation semantics, and that the
firmware's own types and signatures agree across modules.

**Not verified — these need the board:** that the ADC actually clocks at
16 kHz, real SD throughput and latency, the LCD, the button, the LED, and every
call into the real ESP32 SDK. `test/stubs/` is a syntax scaffold, not a
simulator; only the Arduino IDE can confirm the SDK calls compile.

## Hardware caveats

These are real findings, not hypotheticals. 1–3 came from reading
`docs/hardware-wiring-diagram-fritzing.jpg` against the ESP32 datasheet.

**1. The LED cannot be on GPIO35.** The diagram routes it there, but GPIO34–39
on the ESP32 are **input-only** — they have no output driver, so an LED on
GPIO35 can never light no matter what the firmware does. The firmware uses
**GPIO25** instead; move the LED's resistor lead two positions down the header.

**2. The mic and button pins may be swapped.** The written hardware spec says
the mic is on GPIO32, and that is what ships. Tracing the diagram suggests the
opposite — mic on GPIO33, button on GPIO32. Both are ADC1 channels, so both
wirings work electrically. If the LCD shows `Ready` but the button does nothing,
swap `PIN_MIC_OUT` and `PIN_BUTTON` in `config.h` and reflash.

**3. LCD SDA/SCL are reversed from the Arduino default.** The diagram shows SDA
on GPIO22 and SCL on GPIO21; the ESP32 default is the other way round.
`config.h` follows the diagram, and boot probes that order first and then the
swapped one, reporting on serial which answered. Either wiring works — but check
the banner, because a reversed pair is otherwise a silent blank screen.

**4. ESP32 ADC linearity.** The SAR ADC is noticeably nonlinear near both rails.
At the 11/12 dB attenuation this firmware uses, full scale is about 3.1 V, so
anything above that clips. Set the mic module's gain pot so that loud
auscultation peaks stay roughly within 0.3–2.9 V. Too much gain clips; too
little wastes ADC range and raises the noise floor relative to the signal.

**5. No anti-aliasing filter.** The mic module's output is not band-limited to
8 kHz, so any content above the Nyquist frequency folds back into the recording.
Lung and heart sounds live well below 2 kHz so this rarely matters in practice,
but it is a genuine limitation of sampling an unfiltered analog source.

**6. Boost-converter noise.** A switching regulator sharing a rail with an
analog microphone injects switching noise straight into the audio. Power the mic
from the ESP32's **3V3** pin (as the diagram does) rather than from the boost
output, keep its wires short, and add a 10 µF + 100 nF decoupling pair at the
mic module if the noise floor looks high.

**7. Brownout during SD writes.** SD cards draw current in bursts, and a
partially discharged Li-ion through a marginal boost converter can sag enough to
reset the ESP32 mid-recording. If you see unexplained reboots while recording,
that is the first thing to check. The once-per-second header patching means such
a reset costs at most the last second of audio rather than the whole file.

**8. Card removal while recording** is handled — writes fail, the header is
patched to cover what did land, and the LCD shows `SD write failed`. The
partial file stays playable. Do not make a habit of it.

**9. No real-time clock.** The device cannot timestamp anything. The sequence
number in the filename is the only ordering information; the app must attach its
own import timestamp.

**10. SPI clock is deliberately conservative** at 10 MHz (`SD_SPI_HZ`),
because breadboard jumpers are not good SPI transmission lines. The format needs
only 32 kB/s. Raise it only if the SD module is on a soldered board and you have
confirmed it stays reliable.
