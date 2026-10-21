/*
  BuiltByTyler Sensor Kit - S19 TEMP ANALOG (MCP9700A)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads the MCP9700A analog thermometer: 500 mV at 0 C, +10 mV per C.
  tempC = (millivolts - 500) / 10

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    AO   -> GPIO 34

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define AO_PIN   34

void setup() {
  Serial.begin(115200);
}

void loop() {
  long sum = 0;
  for (int i = 0; i < 16; i++) {          // average 16 reads to calm the noise
    sum += analogReadMilliVolts(AO_PIN);  // calibrated millivolts
  }
  int mv = sum / 16;
  float tempC = (mv - 500) / 10.0;
  Serial.printf("%d mV = %.1f C\n", mv, tempC);
  delay(1000);
}
