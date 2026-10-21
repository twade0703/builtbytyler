/*
  BuiltByTyler Sensor Kit - S30 KNOB (10k rotary pot)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads the knob: turn clockwise = higher AO (0..4095).

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
  int ao = analogRead(AO_PIN);             // 0..4095
  int mv = analogReadMilliVolts(AO_PIN);   // 0..~3300 mV
  int percent = ao * 100 / 4095;
  Serial.printf("AO=%4d  %4d mV  %3d%%\n", ao, mv, percent);
  delay(200);
}
