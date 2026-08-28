#!/usr/bin/env bash
# Runs every check that does not need the physical device.
#
#   1. unit tests for the pure modules (pcm, wav_writer, filename)
#   2. an end-to-end WAV emitted by the real code and parsed by Python's
#      standard-library `wave` module
#   3. a syntax check of the Arduino-side sources against stub SDK headers
#
# Requires g++ and python on PATH.
#
#   bash firmware/test/run_tests.sh

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/../ausculta_recorder"
STUBS="$HERE/stubs"
BUILD="$HERE/build"

mkdir -p "$BUILD"

CXX="${CXX:-g++}"
FLAGS="-std=c++17 -Wall -Wextra -Werror -O1"
FAILED=0

step() { printf '\n== %s\n' "$1"; }
fail() { FAILED=1; printf '   FAILED\n'; }

# --- 1. unit tests -----------------------------------------------------------

for suite in pcm wav_writer filename; do
  step "unit: $suite"
  if $CXX $FLAGS -o "$BUILD/test_$suite" "$HERE/test_$suite.cpp" "$SRC/$suite.cpp" \
     && "$BUILD/test_$suite"; then :; else fail; fi
done

# --- 2. end-to-end WAV -------------------------------------------------------

step 'end-to-end: emit and parse a real WAV'
if $CXX $FLAGS -o "$BUILD/make_sample_wav" "$HERE/make_sample_wav.cpp" \
      "$SRC/pcm.cpp" "$SRC/wav_writer.cpp" \
   && "$BUILD/make_sample_wav" "$BUILD" \
   && python "$HERE/verify_wav.py" "$BUILD"; then :; else fail; fi

# --- 3. syntax check of the Arduino-side sources -----------------------------
#
# Compiles against the stubs in test/stubs, so this proves the firmware's own
# types and signatures agree. It canNOT validate calls into the real ESP32 SDK;
# only the Arduino IDE can do that.

step 'syntax: Arduino sources (core 3.x backend)'
for f in audio_capture.cpp storage.cpp ui.cpp; do
  if $CXX -std=gnu++17 -fsyntax-only -I"$STUBS" -I"$SRC" "$SRC/$f"; then
    printf '   ok  %s\n' "$f"
  else
    fail
  fi
done
if $CXX -std=gnu++17 -fsyntax-only -x c++ -I"$STUBS" -I"$SRC" \
     "$SRC/ausculta_recorder.ino"; then
  printf '   ok  ausculta_recorder.ino\n'
else
  fail
fi

step 'syntax: Arduino sources (core 2.x I2S backend)'
if $CXX -std=gnu++17 -fsyntax-only -DESP_ARDUINO_VERSION_MAJOR=2 \
     -I"$STUBS" -I"$SRC" "$SRC/audio_capture.cpp"; then
  printf '   ok  audio_capture.cpp\n'
else
  fail
fi

printf '\n'
if [ "$FAILED" -ne 0 ]; then
  echo 'FAILED'
  exit 1
fi
echo 'All host checks passed.'
echo 'Not covered here: ADC capture, SD card, LCD, button -- those need the board.'
