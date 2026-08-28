// Stub. Host syntax-check only -- see Arduino.h.
#pragma once
#include <Arduino.h>

typedef enum { ADC_ATTEN_DB_0 = 0, ADC_ATTEN_DB_11 = 3, ADC_ATTEN_DB_12 = 3 } adc_atten_t;
typedef enum { ADC_UNIT_1 = 1, ADC_UNIT_2 = 2 } adc_unit_t;
typedef enum { ADC_WIDTH_BIT_12 = 3 } adc_bits_width_t;
typedef enum { ADC1_CHANNEL_0 = 0 } adc1_channel_t;

esp_err_t adc1_config_width(adc_bits_width_t width);
esp_err_t adc1_config_channel_atten(adc1_channel_t channel, adc_atten_t atten);
