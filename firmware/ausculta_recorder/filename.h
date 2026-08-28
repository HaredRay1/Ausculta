// filename.h -- AUSCnnnn.WAV sequencing.
//
// Names are 8.3-safe for FAT, zero-padded so lexical order matches recording
// order, and never reused: the firmware scans the card at boot, takes the
// highest index it finds, and continues from there.
//
// Pure C++: no Arduino headers, unit-tested on the host (test_filename.cpp).
#pragma once

#include <stddef.h>
#include <stdint.h>

// "AUSC0001.WAV" plus the terminating NUL.
#define AUSC_NAME_BUFFER 13

// 8.3 leaves exactly four digits after the "AUSC" stem.
#define AUSC_MAX_INDEX 9999

// Writes "AUSCnnnn.WAV" for `index` into `out`, which must hold at least
// AUSC_NAME_BUFFER bytes. Returns false for index 0 (never issued) or any
// index past AUSC_MAX_INDEX.
bool auscFilenameForIndex(uint16_t index, char* out);

// Parses a directory entry back to its index, or 0 if the name is not one of
// ours. Tolerates a leading path component and any letter case, because
// SD.open() reports "/AUSC0001.WAV" and FAT 8.3 names may come back lowercased.
uint16_t auscIndexFromName(const char* name);

// The index to record next, given the highest one found on the card. Returns 0
// when the sequence is exhausted, so the caller reports a full card rather than
// wrapping around and overwriting AUSC0001.WAV.
uint16_t auscNextIndex(uint16_t highestSeen);
