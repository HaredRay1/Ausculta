# Ausculta device WAV format

The exact bytes `firmware/ausculta_recorder` writes to the SD card. This is the
contract the app's importer is built against.

Everything here is enforced by the host tests in `firmware/test/` — the header
bytes below are asserted literally in `test_wav_writer.cpp`, and `verify_wav.py`
re-parses a real emitted file with Python's standard-library `wave` module.

## Summary

| Property | Value |
|---|---|
| Container | RIFF/WAVE, canonical 44-byte header, no extra chunks |
| Encoding | `WAVE_FORMAT_PCM` (1), uncompressed |
| Sample rate | **16000 Hz** |
| Channels | **1** (mono) |
| Bit depth | **16-bit signed**, two's complement |
| Byte order | Little-endian |
| Byte rate | 32000 bytes/s |
| Block align | 2 bytes |
| Max duration | 120 s (3,840,000 data bytes, 3,840,044 total) |
| Filename | `AUSCnnnn.WAV`, `nnnn` = 0001–9999 |

16 kHz is not a tunable. The Edge Impulse respiratory classifier
(`Asthma` / `Bronchiolitis` / `Healthy` / `Pneumonia`) is trained at exactly this
rate, and resampled audio degrades inference without producing any visible error.

## Byte layout

All multi-byte fields are little-endian. Offsets are decimal.

| Offset | Size | Field | Value written |
|---|---|---|---|
| 0 | 4 | `ChunkID` | `"RIFF"` |
| 4 | 4 | `ChunkSize` | `36 + Subchunk2Size` |
| 8 | 4 | `Format` | `"WAVE"` |
| 12 | 4 | `Subchunk1ID` | `"fmt "` (note trailing space) |
| 16 | 4 | `Subchunk1Size` | `16` |
| 20 | 2 | `AudioFormat` | `1` (PCM) |
| 22 | 2 | `NumChannels` | `1` |
| 24 | 4 | `SampleRate` | `16000` |
| 28 | 4 | `ByteRate` | `32000` |
| 32 | 2 | `BlockAlign` | `2` |
| 34 | 2 | `BitsPerSample` | `16` |
| 36 | 4 | `Subchunk2ID` | `"data"` |
| 40 | 4 | `Subchunk2Size` | data bytes = `samples * 2` |
| 44 | … | audio | signed 16-bit LE samples |

### A real header

The first 44 bytes of a 1.000 s recording (16000 samples, 32000 data bytes),
copied from a file the firmware code actually produced:

```
00  52 49 46 46 24 7D 00 00  RIFF$}..
08  57 41 56 45 66 6D 74 20  WAVEfmt 
16  10 00 00 00 01 00 01 00  ........
24  80 3E 00 00 00 7D 00 00  .>...}..
32  02 00 10 00 64 61 74 61  ....data
40  00 7D 00 00              .}..
```

Reading the two size fields: `24 7D 00 00` = `0x00007D24` = 32036 = 36 + 32000,
and `00 7D 00 00` = `0x00007D00` = 32000.

## Sample encoding

The microphone module is analog. The ESP32 reads it on ADC1 in 12-bit unsigned
mode (`0…4095`), and the firmware converts each reading to signed 16-bit:

```
bias    <- exponential moving average of the readings, 1024-sample time constant
sample  <- (raw - bias) * 16, saturated to [-32768, 32767]
```

Three consequences for the importer:

1. **Already DC-centred.** The mic idles near mid-rail, and that idle point
   drifts with supply voltage and the gain-pot position, so the firmware
   subtracts a *tracked* bias rather than a hardcoded 2048. Do not apply another
   DC-removal pass; the audio is centred on zero when it reaches you.
2. **The gain is exactly 16**, so the 12-bit swing spans the full 16-bit range.
   One ADC count is 16 int16 counts. There is no dithering and no normalisation
   — a quiet recording stays quiet, which is deliberate: relative amplitude
   carries clinical information.
3. **The effective high-pass corner is ~2.5 Hz.** Well below the ~20 Hz floor of
   heart sounds, so nothing clinically relevant is filtered out.

The recording is raw. There is no noise reduction, no AGC, and no anti-alias
filtering beyond whatever the mic module's own analog stage provides — see the
caveat in `README.md`.

## Filenames

`AUSCnnnn.WAV`, zero-padded to four digits: `AUSC0001.WAV` … `AUSC9999.WAV`.

- 8.3-safe, so it survives FAT16/FAT32 and any card reader.
- Zero-padded, so **lexical order equals recording order** — sorting the
  directory listing alphabetically gives you chronological order.
- Never reused. At boot the firmware scans the card root, takes the highest
  index present, and continues from there. Files are never overwritten; if
  `AUSC9999.WAV` exists the device reports a full sequence and refuses to record.
- Always in the card root, never a subdirectory.
- The device has no clock, so there is **no timestamp in the file or the name**.
  The sequence number is the only ordering information available. The app should
  attach its own import timestamp.

## Truncation semantics — important for the importer

The firmware patches the two size fields in place **once per second** while
recording, not only when the recording stops. If the battery is pulled or the
card is yanked mid-recording:

- the file is still a **valid, playable WAV**;
- its header describes the audio up to the **last completed sync**, so at most
  the final ~1 second is lost;
- more audio may physically exist on the card past `Subchunk2Size`. It is
  unreferenced and **must be ignored** — trust the header, not the file size.

So `Subchunk2Size` is authoritative, and `file_size - 44` may legitimately be
larger than it. An importer that infers duration from file size will report the
wrong length on any interrupted recording.

`verify_wav.py` exercises exactly this case (`yanked.wav`).

## What an importer should validate

Reject the file if any of these do not hold — they mean it did not come from
this device, or it is damaged:

```
bytes[0:4]   == "RIFF"
bytes[8:12]  == "WAVE"
AudioFormat  == 1
NumChannels  == 1
SampleRate   == 16000
BitsPerSample== 16
Subchunk2Size > 0
Subchunk2Size % 2 == 0
44 + Subchunk2Size <= file_size
```

Then:

```
duration_seconds = Subchunk2Size / 32000
sample_count     = Subchunk2Size / 2
```

A zero-length `data` chunk means the recording was interrupted before the first
sync — the file is well-formed but carries no audio, and should be discarded
rather than imported as a zero-length recording.

These map onto the app's `Recording` fields as
`importedSampleRate = 16000`, `bitDepth = 16`, `channels = 1`,
`durationSec = Subchunk2Size / 32000`, and
`audioSource = DEVICE_WAV_IMPORT`.
