// storage.h -- SD card mounting, file sequencing, and the SD-backed WavSink.
#pragma once

#include <stdint.h>

#include "filename.h"
#include "wav_writer.h"

enum StorageStatus {
  STORAGE_OK = 0,
  STORAGE_NO_CARD,             // card absent, unseated, or unreadable
  STORAGE_FULL,                // not enough room for a full-length recording
  STORAGE_SEQUENCE_EXHAUSTED,  // AUSC9999.WAV already exists
  STORAGE_OPEN_FAILED,         // card is there but the file would not open
};

// Brings up SPI, mounts the card, and scans the root directory so the next
// filename continues the existing sequence instead of overwriting it.
StorageStatus storageBegin();

bool storageMounted();

// Index that the next recording will use. 0 means the sequence is exhausted.
uint16_t storageNextIndex();

uint64_t storageFreeBytes();
uint64_t storageTotalBytes();

// Opens the next AUSCnnnn.WAV for writing and copies its name into `nameOut`,
// which must hold at least AUSC_NAME_BUFFER bytes. Checks free space first.
StorageStatus storageOpenNext(char* nameOut);

// The sink for the currently open file, or nullptr if none is open.
WavSink* storageSink();

// Closes the open file and advances the sequence.
void storageCloseFile();
