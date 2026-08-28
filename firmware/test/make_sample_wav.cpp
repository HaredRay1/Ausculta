// Host tool: drives the real pcm.cpp and wav_writer.cpp to produce actual .wav
// files on disk, so verify_wav.py can parse them with a parser we did not write.
//
//   make_sample_wav <output-dir>
//
// Emits two files:
//   clean.wav   -- 1.0 s, closed normally
//   yanked.wav  -- 0.25 s synced, then 0.75 s more written and the device
//                  "loses power" before end() runs
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "../ausculta_recorder/pcm.h"
#include "../ausculta_recorder/wav_writer.h"

namespace {

class FileSink : public WavSink {
 public:
  bool open(const std::string& path) {
    f_ = std::fopen(path.c_str(), "wb+");
    return f_ != nullptr;
  }

  bool append(const uint8_t* data, size_t len) override {
    if (std::fseek(f_, 0, SEEK_END) != 0) return false;
    return std::fwrite(data, 1, len, f_) == len;
  }

  bool patch(uint32_t offset, const uint8_t* data, size_t len) override {
    if (std::fseek(f_, (long)offset, SEEK_SET) != 0) return false;
    if (std::fwrite(data, 1, len, f_) != len) return false;
    return std::fseek(f_, 0, SEEK_END) == 0;
  }

  bool sync() override { return std::fflush(f_) == 0; }

  void close() {
    if (f_) std::fclose(f_);
    f_ = nullptr;
  }

 private:
  std::FILE* f_ = nullptr;
};

// Fake ADC output: a 200 Hz tone riding on a deliberately off-centre idle point
// of 2300 counts, so the emitted audio also demonstrates the DC tracker working.
std::vector<uint16_t> syntheticAdc(int samples) {
  const double kPi = 3.14159265358979323846;
  std::vector<uint16_t> raw;
  raw.reserve(samples);
  for (int i = 0; i < samples; i++) {
    const double phase = 2.0 * kPi * 200.0 * (double)i / 16000.0;
    raw.push_back((uint16_t)(2300.0 + 800.0 * std::sin(phase)));
  }
  return raw;
}

std::vector<int16_t> toPcm(const std::vector<uint16_t>& raw) {
  PcmConverter c;
  pcmReset(&c);
  std::vector<int16_t> out(raw.size());
  pcmConvertBlock(&c, raw.data(), out.data(), raw.size());
  return out;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::fprintf(stderr, "usage: make_sample_wav <output-dir>\n");
    return 2;
  }
  const std::string dir = argv[1];
  const std::vector<int16_t> pcm = toPcm(syntheticAdc(16000));  // 1.0 s

  {
    FileSink sink;
    if (!sink.open(dir + "/clean.wav")) return 1;
    WavWriter w;
    if (!w.begin(&sink, 16000)) return 1;
    if (!w.writeSamples(pcm.data(), pcm.size())) return 1;
    if (!w.end()) return 1;
    sink.close();
  }

  {
    FileSink sink;
    if (!sink.open(dir + "/yanked.wav")) return 1;
    WavWriter w;
    if (!w.begin(&sink, 16000)) return 1;
    if (!w.writeSamples(pcm.data(), 4000)) return 1;  // 0.25 s
    if (!w.sync()) return 1;                          // periodic flush
    if (!w.writeSamples(pcm.data() + 4000, 12000)) return 1;
    sink.close();  // power cut: end() never runs
  }

  std::printf("wrote clean.wav and yanked.wav to %s\n", dir.c_str());
  return 0;
}
