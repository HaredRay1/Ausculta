// Tests for the AUSCnnnn.WAV sequencing. Getting this wrong overwrites patient
// recordings, so both directions of the mapping are pinned down here.
#include "../ausculta_recorder/filename.h"

#include <cstdint>

#include "test_util.h"

namespace {

void testFormatsEightDotThree() {
  char name[AUSC_NAME_BUFFER];
  CHECK(auscFilenameForIndex(1, name));
  CHECK_STR_EQ(name, "AUSC0001.WAV");
  CHECK(auscFilenameForIndex(7, name));
  CHECK_STR_EQ(name, "AUSC0007.WAV");
  CHECK(auscFilenameForIndex(123, name));
  CHECK_STR_EQ(name, "AUSC0123.WAV");
  CHECK(auscFilenameForIndex(AUSC_MAX_INDEX, name));
  CHECK_STR_EQ(name, "AUSC9999.WAV");
}

// Sortable: lexical order must equal chronological order, which is the whole
// point of zero-padding.
void testNamesSortChronologically() {
  char a[AUSC_NAME_BUFFER], b[AUSC_NAME_BUFFER];
  auscFilenameForIndex(9, a);
  auscFilenameForIndex(10, b);
  CHECK(std::string(a) < std::string(b));
}

void testRejectsOutOfRangeIndices() {
  char name[AUSC_NAME_BUFFER];
  CHECK(!auscFilenameForIndex(0, name));                   // sequence starts at 1
  CHECK(!auscFilenameForIndex(AUSC_MAX_INDEX + 1, name));  // 8.3 has no room
}

void testParsesOurOwnNames() {
  CHECK_EQ(auscIndexFromName("AUSC0001.WAV"), 1u);
  CHECK_EQ(auscIndexFromName("AUSC0007.WAV"), 7u);
  CHECK_EQ(auscIndexFromName("AUSC9999.WAV"), 9999u);
}

// SD.open() hands back names with a leading slash; FAT is case-insensitive and
// some card readers report 8.3 names lowercased.
void testParsesRealWorldNameVariants() {
  CHECK_EQ(auscIndexFromName("/AUSC0042.WAV"), 42u);
  CHECK_EQ(auscIndexFromName("ausc0042.wav"), 42u);
  CHECK_EQ(auscIndexFromName("/Ausc0042.Wav"), 42u);
}

// Anything we did not write must not advance the sequence.
void testIgnoresForeignNames() {
  CHECK_EQ(auscIndexFromName("NOTE0001.WAV"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC0001.TXT"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC00A1.WAV"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC001.WAV"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC00001.WAV"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC0001.WAVE"), 0u);
  CHECK_EQ(auscIndexFromName(""), 0u);
  CHECK_EQ(auscIndexFromName("/"), 0u);
  CHECK_EQ(auscIndexFromName("SYSTEM~1"), 0u);
  CHECK_EQ(auscIndexFromName("AUSC0000.WAV"), 0u);  // index 0 is never issued
}

// The boot scan keeps a running maximum; the next recording is max + 1 so a
// gap in the middle of the sequence is never refilled.
void testNextIndexContinuesPastHighest() {
  uint16_t highest = 0;
  const char* onCard[] = {"AUSC0001.WAV", "README.TXT", "AUSC0005.WAV",
                          "AUSC0003.WAV", "ausc0002.wav"};
  for (const char* entry : onCard) {
    const uint16_t idx = auscIndexFromName(entry);
    if (idx > highest) highest = idx;
  }
  CHECK_EQ(highest, 5u);
  CHECK_EQ(auscNextIndex(highest), 6u);
}

void testNextIndexOnEmptyCard() {
  CHECK_EQ(auscNextIndex(0), 1u);
}

// At the top of the range there is no valid next name; the caller must be told
// rather than silently wrapping to AUSC0001 and overwriting.
void testNextIndexSaturates() {
  CHECK_EQ(auscNextIndex(AUSC_MAX_INDEX), 0u);
}

void testRoundTrip() {
  char name[AUSC_NAME_BUFFER];
  for (uint16_t i = 1; i <= AUSC_MAX_INDEX; i++) {
    CHECK(auscFilenameForIndex(i, name));
    if (auscIndexFromName(name) != i) {
      CHECK_EQ(auscIndexFromName(name), i);
      break;
    }
  }
  testutil::checks()++;  // count the loop as one passing check
}

}  // namespace

int main() {
  testFormatsEightDotThree();
  testNamesSortChronologically();
  testRejectsOutOfRangeIndices();
  testParsesOurOwnNames();
  testParsesRealWorldNameVariants();
  testIgnoresForeignNames();
  testNextIndexContinuesPastHighest();
  testNextIndexOnEmptyCard();
  testNextIndexSaturates();
  testRoundTrip();
  return testutil::finish("filename");
}
