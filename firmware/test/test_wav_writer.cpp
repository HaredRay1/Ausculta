// Byte-exact tests for the RIFF/WAVE output. These lock down the format
// contract that firmware/WAV_FORMAT.md publishes to the app team.
#include "../ausculta_recorder/wav_writer.h"

#include <cstdint>
#include <vector>

#include "memory_sink.h"
#include "test_util.h"

namespace {

// The exact 44 bytes the firmware must emit for 16 kHz / mono / 16-bit with an
// empty data chunk. Hand-computed from the RIFF spec, not from our own code.
const unsigned char kEmptyHeader[44] = {
    'R',  'I',  'F',  'F',   // ChunkID
    0x24, 0x00, 0x00, 0x00,  // ChunkSize = 36 + 0
    'W',  'A',  'V',  'E',   // Format
    'f',  'm',  't',  ' ',   // Subchunk1ID
    0x10, 0x00, 0x00, 0x00,  // Subchunk1Size = 16 (PCM)
    0x01, 0x00,              // AudioFormat = 1 (PCM)
    0x01, 0x00,              // NumChannels = 1
    0x80, 0x3E, 0x00, 0x00,  // SampleRate = 16000
    0x00, 0x7D, 0x00, 0x00,  // ByteRate = 16000 * 1 * 2 = 32000
    0x02, 0x00,              // BlockAlign = 1 * 2 = 2
    0x10, 0x00,              // BitsPerSample = 16
    'd',  'a',  't',  'a',   // Subchunk2ID
    0x00, 0x00, 0x00, 0x00,  // Subchunk2Size = 0
};

void testHeaderLayoutEmpty() {
  uint8_t header[WAV_HEADER_BYTES];
  wavBuildHeader(header, 16000, 1, 16, 0);
  CHECK_EQ((int)WAV_HEADER_BYTES, 44);
  CHECK_BYTES_EQ(header, kEmptyHeader, 44);
}

void testHeaderLayoutWithData() {
  // 64000 bytes = 32000 samples = 2.0 s at 16 kHz.
  uint8_t header[WAV_HEADER_BYTES];
  wavBuildHeader(header, 16000, 1, 16, 64000);

  unsigned char want[44];
  std::memcpy(want, kEmptyHeader, 44);
  want[4] = 0x24; want[5] = 0xFA; want[6] = 0x00; want[7] = 0x00;   // 64036
  want[40] = 0x00; want[41] = 0xFA; want[42] = 0x00; want[43] = 0x00;  // 64000
  CHECK_BYTES_EQ(header, want, 44);
}

// A file must be parseable the moment it is created, before any audio arrives.
void testBeginWritesProvisionalHeader() {
  MemorySink sink;
  WavWriter w;
  CHECK(w.begin(&sink, 16000));
  CHECK_EQ((int)sink.bytes.size(), 44);
  CHECK_BYTES_EQ(sink.bytes.data(), kEmptyHeader, 44);
  CHECK_EQ(w.dataBytes(), 0u);
}

void testSamplesAreLittleEndian() {
  MemorySink sink;
  WavWriter w;
  w.begin(&sink, 16000);

  const int16_t samples[] = {0, 1, -1, 32767, -32768, 0x1234};
  CHECK(w.writeSamples(samples, 6));

  CHECK_EQ((int)sink.bytes.size(), 44 + 12);
  CHECK_EQ(sink.i16At(44 + 0), (int16_t)0);
  CHECK_EQ(sink.i16At(44 + 2), (int16_t)1);
  CHECK_EQ(sink.i16At(44 + 4), (int16_t)-1);
  CHECK_EQ(sink.i16At(44 + 6), (int16_t)32767);
  CHECK_EQ(sink.i16At(44 + 8), (int16_t)-32768);
  // Explicit byte order check: 0x1234 must land as 34 12.
  CHECK_EQ((int)sink.bytes[44 + 10], 0x34);
  CHECK_EQ((int)sink.bytes[44 + 11], 0x12);
}

// The crash-safety requirement: after a mid-recording sync the sizes on the
// card must already describe every sample written so far.
void testSyncPatchesSizesMidRecording() {
  MemorySink sink;
  WavWriter w;
  w.begin(&sink, 16000);

  std::vector<int16_t> block(1000, 42);
  w.writeSamples(block.data(), block.size());

  // Before sync the header still says zero -- nothing has been patched yet.
  CHECK_EQ(sink.u32At(40), 0u);

  CHECK(w.sync());
  CHECK_EQ(sink.u32At(40), 2000u);       // data size  = 1000 * 2
  CHECK_EQ(sink.u32At(4), 36u + 2000u);  // riff size
  CHECK_EQ(sink.syncCount, 1);

  // More audio, another sync: sizes must advance again.
  w.writeSamples(block.data(), block.size());
  CHECK(w.sync());
  CHECK_EQ(sink.u32At(40), 4000u);
  CHECK_EQ(sink.u32At(4), 36u + 4000u);
}

void testEndPatchesFinalSizes() {
  MemorySink sink;
  WavWriter w;
  w.begin(&sink, 16000);

  std::vector<int16_t> block(16000, -7);  // exactly 1 second
  w.writeSamples(block.data(), block.size());
  CHECK(w.end());

  CHECK_EQ(w.sampleCount(), 16000u);
  CHECK_EQ(w.dataBytes(), 32000u);
  CHECK_EQ(sink.u32At(40), 32000u);
  CHECK_EQ(sink.u32At(4), 36u + 32000u);
  CHECK_EQ((int)sink.bytes.size(), 44 + 32000);
}

void testWriteFailureIsSticky() {
  MemorySink sink;
  WavWriter w;
  w.begin(&sink, 16000);

  sink.failAfterBytes = 44 + 100;  // fail once we are 100 bytes into the data
  std::vector<int16_t> block(200, 1);

  CHECK(!w.writeSamples(block.data(), block.size()));
  CHECK(w.failed());

  // Once failed the writer must refuse further work rather than silently
  // producing a file whose header disagrees with its contents.
  sink.failAfterBytes = -1;
  CHECK(!w.writeSamples(block.data(), block.size()));
  CHECK(!w.end());
}

void testBeginRejectsNullSink() {
  WavWriter w;
  CHECK(!w.begin(nullptr, 16000));
  CHECK(w.failed());
}

// 120 s at 16 kHz is 3,840,000 bytes; confirm nothing overflows at the cap.
void testMaxRecordingSizeArithmetic() {
  uint8_t header[WAV_HEADER_BYTES];
  const uint32_t dataBytes = 16000u * 2u * 120u;
  CHECK_EQ(dataBytes, 3840000u);
  wavBuildHeader(header, 16000, 1, 16, dataBytes);
  const uint32_t riff = (uint32_t)header[4] | ((uint32_t)header[5] << 8) |
                        ((uint32_t)header[6] << 16) | ((uint32_t)header[7] << 24);
  CHECK_EQ(riff, dataBytes + 36u);
}

}  // namespace

int main() {
  testHeaderLayoutEmpty();
  testHeaderLayoutWithData();
  testBeginWritesProvisionalHeader();
  testSamplesAreLittleEndian();
  testSyncPatchesSizesMidRecording();
  testEndPatchesFinalSizes();
  testWriteFailureIsSticky();
  testBeginRejectsNullSink();
  testMaxRecordingSizeArithmetic();
  return testutil::finish("wav_writer");
}
