// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>

#define SOC_ADC_DIGI_RESULT_BYTES 2

typedef enum { ADC_ATTEN_DB_0 = 0, ADC_ATTEN_DB_12 = 3, ADC_ATTEN_DB_11 = 3 } adc_atten_t;
typedef enum { ADC_UNIT_1 = 0, ADC_UNIT_2 = 1 } adc_unit_t;
typedef enum { ADC_BITWIDTH_12 = 12 } adc_bitwidth_t;
typedef enum { ADC_CONV_SINGLE_UNIT_1 = 1 } adc_digi_convert_mode_t;
typedef enum { ADC_DIGI_OUTPUT_FORMAT_TYPE1 = 0 } adc_digi_output_format_t;

typedef struct {
  uint8_t atten;
  uint8_t channel;
  uint8_t unit;
  uint8_t bit_width;
} adc_digi_pattern_config_t;

typedef union {
  struct {
    uint16_t data : 12;
    uint16_t channel : 4;
  } type1;
  uint16_t val;
} adc_digi_output_data_t;

typedef struct adc_continuous_ctx_t* adc_continuous_handle_t;

typedef struct {
  uint32_t max_store_buf_size;
  uint32_t conv_frame_size;
} adc_continuous_handle_cfg_t;

typedef struct {
  uint32_t pattern_num;
  adc_digi_pattern_config_t* adc_pattern;
  uint32_t sample_freq_hz;
  adc_digi_convert_mode_t conv_mode;
  adc_digi_output_format_t format;
} adc_continuous_config_t;

typedef struct {
  uint32_t size;
} adc_continuous_evt_data_t;

typedef bool (*adc_continuous_callback_t)(adc_continuous_handle_t handle,
                                          const adc_continuous_evt_data_t* edata,
                                          void* user_data);

typedef struct {
  adc_continuous_callback_t on_conv_done;
  adc_continuous_callback_t on_pool_ovf;
} adc_continuous_evt_cbs_t;

esp_err_t adc_continuous_new_handle(const adc_continuous_handle_cfg_t* cfg,
                                    adc_continuous_handle_t* handle);
esp_err_t adc_continuous_config(adc_continuous_handle_t handle,
                                const adc_continuous_config_t* cfg);
esp_err_t adc_continuous_register_event_callbacks(adc_continuous_handle_t handle,
                                                  const adc_continuous_evt_cbs_t* cbs,
                                                  void* user_data);
esp_err_t adc_continuous_start(adc_continuous_handle_t handle);
esp_err_t adc_continuous_stop(adc_continuous_handle_t handle);
esp_err_t adc_continuous_deinit(adc_continuous_handle_t handle);
esp_err_t adc_continuous_read(adc_continuous_handle_t handle, uint8_t* buf,
                              uint32_t length, uint32_t* out_length,
                              uint32_t timeout_ms);
