#include "filename.h"

namespace {

char toUpper(char c) {
  return (c >= 'a' && c <= 'z') ? (char)(c - ('a' - 'A')) : c;
}

// Returns the basename: everything after the last path separator.
const char* baseName(const char* path) {
  const char* base = path;
  for (const char* p = path; *p != '\0'; p++) {
    if (*p == '/' || *p == '\\') base = p + 1;
  }
  return base;
}

}  // namespace

bool auscFilenameForIndex(uint16_t index, char* out) {
  if (out == nullptr) return false;
  if (index == 0 || index > AUSC_MAX_INDEX) return false;

  out[0] = 'A';
  out[1] = 'U';
  out[2] = 'S';
  out[3] = 'C';
  out[4] = (char)('0' + (index / 1000) % 10);
  out[5] = (char)('0' + (index / 100) % 10);
  out[6] = (char)('0' + (index / 10) % 10);
  out[7] = (char)('0' + index % 10);
  out[8] = '.';
  out[9] = 'W';
  out[10] = 'A';
  out[11] = 'V';
  out[12] = '\0';
  return true;
}

uint16_t auscIndexFromName(const char* name) {
  if (name == nullptr) return 0;

  const char* p = baseName(name);

  size_t len = 0;
  while (p[len] != '\0') len++;
  if (len != AUSC_NAME_BUFFER - 1) return 0;

  if (toUpper(p[0]) != 'A' || toUpper(p[1]) != 'U' || toUpper(p[2]) != 'S' ||
      toUpper(p[3]) != 'C') {
    return 0;
  }
  if (p[8] != '.') return 0;
  if (toUpper(p[9]) != 'W' || toUpper(p[10]) != 'A' || toUpper(p[11]) != 'V') {
    return 0;
  }

  uint16_t index = 0;
  for (int i = 4; i < 8; i++) {
    if (p[i] < '0' || p[i] > '9') return 0;
    index = (uint16_t)(index * 10 + (uint16_t)(p[i] - '0'));
  }
  // AUSC0000.WAV is never issued, so treat it as foreign rather than as index 0.
  return index;
}

uint16_t auscNextIndex(uint16_t highestSeen) {
  if (highestSeen >= AUSC_MAX_INDEX) return 0;
  return (uint16_t)(highestSeen + 1);
}
