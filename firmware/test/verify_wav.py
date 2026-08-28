"""End-to-end check of the emitted WAV files.

Parses the output of make_sample_wav with Python's standard-library `wave`
module -- a parser nobody on this project wrote -- so a passing run means the
format contract in WAV_FORMAT.md holds against an independent reader, not just
against our own assertions.

Usage:  python verify_wav.py <dir-containing-clean.wav-and-yanked.wav>
"""

import os
import struct
import sys
import wave

FAILURES = []


def check(condition, message):
    if condition:
        print("  ok   %s" % message)
    else:
        print("  FAIL %s" % message)
        FAILURES.append(message)


def check_eq(actual, expected, label):
    check(actual == expected, "%s = %r (want %r)" % (label, actual, expected))


def verify_clean(path):
    print("clean.wav -- normal stop")
    with wave.open(path, "rb") as w:
        check_eq(w.getnchannels(), 1, "channels")
        check_eq(w.getsampwidth(), 2, "sample width (bytes)")
        check_eq(w.getframerate(), 16000, "sample rate")
        check_eq(w.getcomptype(), "NONE", "compression")
        check_eq(w.getnframes(), 16000, "frames")
        frames = w.readframes(w.getnframes())

    check_eq(len(frames), 32000, "data bytes read")
    check_eq(os.path.getsize(path), 44 + 32000, "file size on disk")

    samples = struct.unpack("<%dh" % (len(frames) // 2), frames)

    # The synthetic input idles at 2300 counts, not mid-rail. If the DC tracker
    # works the recorded audio still averages out to roughly zero.
    mean = sum(samples) / float(len(samples))
    check(abs(mean) < 200, "mean sample %.1f is centred on zero" % mean)

    # Input amplitude was 800 ADC counts; the 12->16 bit gain is 16x.
    peak = max(abs(s) for s in samples)
    check(11500 < peak < 13500, "peak amplitude %d ~= 800 counts * 16" % peak)


def verify_yanked(path):
    print("yanked.wav -- power lost after a periodic sync")
    with wave.open(path, "rb") as w:
        check_eq(w.getnchannels(), 1, "channels")
        check_eq(w.getframerate(), 16000, "sample rate")
        # The header must describe exactly what the last sync covered, so the
        # file stays valid and playable even though end() never ran.
        check_eq(w.getnframes(), 4000, "frames (0.25 s, the last synced point)")
        frames = w.readframes(w.getnframes())
    check_eq(len(frames), 8000, "readable data bytes")

    # More audio physically reached the card than the header claims; that is the
    # expected trade -- a valid short file rather than a corrupt long one.
    check(os.path.getsize(path) > 44 + 8000,
          "unreferenced tail present on disk (%d bytes)" % os.path.getsize(path))


def verify_raw_header(path):
    print("clean.wav -- byte-level header")
    with open(path, "rb") as fh:
        head = fh.read(44)
    check_eq(head[0:4], b"RIFF", "ChunkID")
    check_eq(struct.unpack("<I", head[4:8])[0], 36 + 32000, "ChunkSize")
    check_eq(head[8:12], b"WAVE", "Format")
    check_eq(head[12:16], b"fmt ", "Subchunk1ID")
    check_eq(struct.unpack("<I", head[16:20])[0], 16, "Subchunk1Size")
    check_eq(struct.unpack("<H", head[20:22])[0], 1, "AudioFormat (PCM)")
    check_eq(struct.unpack("<H", head[22:24])[0], 1, "NumChannels")
    check_eq(struct.unpack("<I", head[24:28])[0], 16000, "SampleRate")
    check_eq(struct.unpack("<I", head[28:32])[0], 32000, "ByteRate")
    check_eq(struct.unpack("<H", head[32:34])[0], 2, "BlockAlign")
    check_eq(struct.unpack("<H", head[34:36])[0], 16, "BitsPerSample")
    check_eq(head[36:40], b"data", "Subchunk2ID")
    check_eq(struct.unpack("<I", head[40:44])[0], 32000, "Subchunk2Size")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    directory = sys.argv[1]
    verify_raw_header(os.path.join(directory, "clean.wav"))
    verify_clean(os.path.join(directory, "clean.wav"))
    verify_yanked(os.path.join(directory, "yanked.wav"))

    if FAILURES:
        print("\nFAIL verify_wav (%d failures)" % len(FAILURES))
        return 1
    print("\nPASS verify_wav")
    return 0


if __name__ == "__main__":
    sys.exit(main())
