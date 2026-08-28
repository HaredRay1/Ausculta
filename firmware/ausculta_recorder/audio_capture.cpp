#include "audio_capture.h"

#include <Arduino.h>
#include <string.h>

#include "config.h"
#include "pcm.h"

// Arduino-ESP32 3.x dropped the legacy I2S built-in ADC driver and replaced it
// with the ESP-IDF continuous ADC driver. Both reach the same peripheral; pick
// whichever the installed core provides.
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
#define AUSC_BACKEND_ADC_CONTINUOUS 1
#else
#define AUSC_BACKEND_I2S_ADC 1
#endif

#if AUSC_BACKEND_ADC_CONTINUOUS
#include "esp_adc/adc_continuous.h"
#include "esp_idf_version.h"
// ADC_ATTEN_DB_11 was renamed ADC_ATTEN_DB_12 in IDF 5.2. Same 3.1 V full
// scale either way, which is what a 3.3 V-powered mic module needs.
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 2, 0)
#define AUSC_ADC_ATTEN ADC_ATTEN_DB_12
#else
#define AUSC_ADC_ATTEN ADC_ATTEN_DB_11
#endif
#else
#include <driver/adc.h>
#include <driver/i2s.h>
#define AUSC_ADC_ATTEN ADC_ATTEN_DB_11
#define AUSC_I2S_PORT I2S_NUM_0
#endif

namespace {

PcmConverter g_pcm;
bool g_running = false;
int g_channel = -1;
volatile uint32_t g_overflows = 0;

// Staging buffer for one drain pass, in raw peripheral words.
uint8_t g_dmaScratch[AUDIO_WRITE_BLOCK_SAMPLES * 2];

// ADC1 is the only unit usable here: ADC2 is claimed by WiFi and is not
// reachable by the DMA path at all.
int adc1ChannelForPin(int pin) {
  switch (pin) {
    case 36: return 0;  // VP
    case 37: return 1;
    case 38: return 2;
    case 39: return 3;  // VN
    case 32: return 4;
    case 33: return 5;
    case 34: return 6;
    case 35: return 7;
    default: return -1;
  }
}

#if AUSC_BACKEND_ADC_CONTINUOUS

adc_continuous_handle_t g_handle = nullptr;

bool IRAM_ATTR onPoolOverflow(adc_continuous_handle_t, const adc_continuous_evt_data_t*, void*) {
  g_overflows++;
  return false;
}

#endif

}  // namespace

const char* audioCaptureBackendName() {
#if AUSC_BACKEND_ADC_CONTINUOUS
  return "adc_continuous";
#else
  return "i2s-adc";
#endif
}

uint32_t audioCaptureOverflows() { return g_overflows; }

int16_t audioCaptureBiasCounts() { return pcmBias(&g_pcm); }

// ---------------------------------------------------------------------------
// Arduino-ESP32 3.x -- ESP-IDF continuous (DMA) ADC driver
// ---------------------------------------------------------------------------
#if AUSC_BACKEND_ADC_CONTINUOUS

bool audioCaptureBegin(uint32_t sampleRateHz, int adcPin) {
  if (g_running) audioCaptureEnd();

  g_channel = adc1ChannelForPin(adcPin);
  if (g_channel < 0) return false;

  pcmReset(&g_pcm);
  g_overflows = 0;

  adc_continuous_handle_cfg_t handleCfg = {};
  handleCfg.max_store_buf_size = AUDIO_DMA_BUFFER_BYTES;
  handleCfg.conv_frame_size = AUDIO_DMA_FRAME_BYTES;
  if (adc_continuous_new_handle(&handleCfg, &g_handle) != ESP_OK) return false;

  adc_digi_pattern_config_t pattern = {};
  pattern.atten = AUSC_ADC_ATTEN;
  pattern.channel = (uint8_t)g_channel;
  pattern.unit = ADC_UNIT_1;
  pattern.bit_width = ADC_BITWIDTH_12;

  adc_continuous_config_t cfg = {};
  cfg.pattern_num = 1;
  cfg.adc_pattern = &pattern;
  cfg.sample_freq_hz = sampleRateHz;
  cfg.conv_mode = ADC_CONV_SINGLE_UNIT_1;
  cfg.format = ADC_DIGI_OUTPUT_FORMAT_TYPE1;  // the only format the ESP32 emits

  if (adc_continuous_config(g_handle, &cfg) != ESP_OK) {
    adc_continuous_deinit(g_handle);
    g_handle = nullptr;
    return false;
  }

  adc_continuous_evt_cbs_t cbs = {};
  cbs.on_pool_ovf = onPoolOverflow;
  adc_continuous_register_event_callbacks(g_handle, &cbs, nullptr);

  if (adc_continuous_start(g_handle) != ESP_OK) {
    adc_continuous_deinit(g_handle);
    g_handle = nullptr;
    return false;
  }

  g_running = true;
  return true;
}

size_t audioCaptureRead(int16_t* out, size_t maxSamples) {
  if (!g_running || out == nullptr || maxSamples == 0) return 0;

  size_t produced = 0;
  while (produced < maxSamples) {
    size_t want = (maxSamples - produced) * SOC_ADC_DIGI_RESULT_BYTES;
    if (want > sizeof(g_dmaScratch)) want = sizeof(g_dmaScratch);
    want -= want % SOC_ADC_DIGI_RESULT_BYTES;
    if (want == 0) break;

    uint32_t got = 0;
    // Timeout 0: drain what is ready and return. The caller owns the pacing.
    if (adc_continuous_read(g_handle, g_dmaScratch, want, &got, 0) != ESP_OK) break;
    if (got == 0) break;

    for (uint32_t i = 0; i + SOC_ADC_DIGI_RESULT_BYTES <= got;
         i += SOC_ADC_DIGI_RESULT_BYTES) {
      adc_digi_output_data_t* item = (adc_digi_output_data_t*)&g_dmaScratch[i];
      // Only one channel is in the pattern, but the peripheral can emit a stray
      // word around a start/stop boundary. Dropping foreign words is cheaper
      // than letting one land in the audio as a click.
      if ((int)item->type1.channel != g_channel) continue;
      if (produced >= maxSamples) break;
      out[produced++] = pcmConvertSample(&g_pcm, item->type1.data);
    }
  }
  return produced;
}

void audioCaptureEnd() {
  if (g_handle != nullptr) {
    adc_continuous_stop(g_handle);
    adc_continuous_deinit(g_handle);
    g_handle = nullptr;
  }
  g_running = false;
}

// ---------------------------------------------------------------------------
// Arduino-ESP32 2.x -- legacy I2S built-in ADC mode
// ---------------------------------------------------------------------------
#else

bool audioCaptureBegin(uint32_t sampleRateHz, int adcPin) {
  if (g_running) audioCaptureEnd();

  g_channel = adc1ChannelForPin(adcPin);
  if (g_channel < 0) return false;

  pcmReset(&g_pcm);
  g_overflows = 0;

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_ADC_BUILT_IN);
  cfg.sample_rate = sampleRateHz;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = AUDIO_DMA_BUFFER_BYTES / AUDIO_DMA_FRAME_BYTES;
  cfg.dma_buf_len = AUDIO_DMA_FRAME_BYTES / 2;  // in samples, not bytes
  cfg.use_apll = false;

  if (i2s_driver_install(AUSC_I2S_PORT, &cfg, 0, nullptr) != ESP_OK) return false;

  adc1_config_width(ADC_WIDTH_BIT_12);
  adc1_config_channel_atten((adc1_channel_t)g_channel, AUSC_ADC_ATTEN);

  if (i2s_set_adc_mode(ADC_UNIT_1, (adc1_channel_t)g_channel) != ESP_OK ||
      i2s_adc_enable(AUSC_I2S_PORT) != ESP_OK) {
    i2s_driver_uninstall(AUSC_I2S_PORT);
    return false;
  }

  g_running = true;
  return true;
}

size_t audioCaptureRead(int16_t* out, size_t maxSamples) {
  if (!g_running || out == nullptr || maxSamples == 0) return 0;

  size_t produced = 0;
  while (produced < maxSamples) {
    size_t want = (maxSamples - produced) * 2;
    if (want > sizeof(g_dmaScratch)) want = sizeof(g_dmaScratch);
    want -= want % 2;
    if (want == 0) break;

    size_t got = 0;
    if (i2s_read(AUSC_I2S_PORT, g_dmaScratch, want, &got, 0) != ESP_OK) break;
    if (got == 0) break;

    const uint16_t* words = (const uint16_t*)g_dmaScratch;
    const size_t wordCount = got / 2;
    for (size_t i = 0; i < wordCount && produced < maxSamples; i++) {
      // Built-in ADC mode packs the channel in the top 4 bits and the reading
      // in the low 12.
      if ((int)((words[i] >> 12) & 0x0F) != g_channel) continue;
      out[produced++] = pcmConvertSample(&g_pcm, words[i] & 0x0FFF);
    }
  }
  return produced;
}

void audioCaptureEnd() {
  if (g_running) {
    i2s_adc_disable(AUSC_I2S_PORT);
    i2s_driver_uninstall(AUSC_I2S_PORT);
  }
  g_running = false;
}

#endif
