/*
  BuiltByTyler Sensor Kit - S36 THERMISTOR (NTC 10k)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads the 10k NTC thermistor (B = 3380) and prints degrees C.
  Circuit: NTC from VCC to AO, 10k from AO to GND, so warmer = higher AO.
    R_ntc = 10k * (VCC - V) / V
    T = 1 / (1/298.15 + ln(R_ntc / 10k) / B) - 273.15

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    AO   -> GPIO 34

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define AO_PIN   34

const float VCC_MV = 3300.0;   // the 3V3 pin
const float R_FIXED = 10000.0; // 10k to GND
const float R25 = 10000.0;     // NTC is 10k at 25 C
const float BETA = 3380.0;     // B value (printed on the back)

void setup() {
  Serial.begin(115200);
}

void loop() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(AO_PIN);
  float mv = sum / 16.0;
  if (mv < 10 || mv > VCC_MV - 10) {          // open or shorted
    Serial.printf("%.0f mV - check the wiring\n", mv);
  } else {
    float r = R_FIXED * (VCC_MV - mv) / mv;    // thermistor resistance
    float tempC = 1.0 / (1.0 / 298.15 + log(r / R25) / BETA) - 273.15;
    Serial.printf("%.0f mV  R=%.0f ohm  = %.1f C\n", mv, r, tempC);
  }
  delay(1000);
}
