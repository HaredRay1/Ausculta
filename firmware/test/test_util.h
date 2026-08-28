// Minimal assertion harness for the host-side firmware tests.
// No framework: these tests must build with nothing but g++ and the standard
// library, so anyone can run them without installing tooling.
#pragma once

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace testutil {

inline int& failures() {
  static int n = 0;
  return n;
}

inline int& checks() {
  static int n = 0;
  return n;
}

inline void report(const char* file, int line, const char* expr, const std::string& detail) {
  failures()++;
  std::printf("  FAIL %s:%d\n       %s\n", file, line, expr);
  if (!detail.empty()) {
    std::printf("       %s\n", detail.c_str());
  }
}

inline std::string hexDump(const unsigned char* data, size_t len) {
  std::string out;
  char buf[8];
  for (size_t i = 0; i < len; i++) {
    std::snprintf(buf, sizeof(buf), "%02X ", data[i]);
    out += buf;
  }
  return out;
}

inline int finish(const char* suite) {
  if (failures() == 0) {
    std::printf("PASS %s (%d checks)\n", suite, checks());
    return 0;
  }
  std::printf("FAIL %s (%d failures / %d checks)\n", suite, failures(), checks());
  return 1;
}

}  // namespace testutil

#define CHECK(expr)                                                     \
  do {                                                                  \
    testutil::checks()++;                                               \
    if (!(expr)) testutil::report(__FILE__, __LINE__, #expr, "");       \
  } while (0)

#define CHECK_EQ(actual, expected)                                          \
  do {                                                                      \
    testutil::checks()++;                                                   \
    auto _a = (actual);                                                     \
    auto _e = (expected);                                                   \
    if (!(_a == _e)) {                                                      \
      char _d[160];                                                         \
      std::snprintf(_d, sizeof(_d), "got %lld, want %lld",                  \
                    (long long)_a, (long long)_e);                          \
      testutil::report(__FILE__, __LINE__, #actual " == " #expected, _d);   \
    }                                                                       \
  } while (0)

#define CHECK_STR_EQ(actual, expected)                                      \
  do {                                                                      \
    testutil::checks()++;                                                   \
    std::string _a((actual));                                               \
    std::string _e((expected));                                             \
    if (_a != _e) {                                                         \
      testutil::report(__FILE__, __LINE__, #actual " == " #expected,        \
                       "got \"" + _a + "\", want \"" + _e + "\"");          \
    }                                                                       \
  } while (0)

#define CHECK_BYTES_EQ(actual, expected, len)                               \
  do {                                                                      \
    testutil::checks()++;                                                   \
    const unsigned char* _a = (const unsigned char*)(actual);               \
    const unsigned char* _e = (const unsigned char*)(expected);             \
    if (std::memcmp(_a, _e, (len)) != 0) {                                  \
      testutil::report(__FILE__, __LINE__, #actual " == " #expected,        \
                       "got  " + testutil::hexDump(_a, (len)) +             \
                       "\n       want " + testutil::hexDump(_e, (len)));    \
    }                                                                       \
  } while (0)
