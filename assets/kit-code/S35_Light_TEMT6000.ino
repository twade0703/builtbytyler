/*
  BuiltByTyler Sensor Kit - S35 LIGHT TEMT6000 (Vishay TEMT6000X01)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads ambient light (matched to the human eye). Brighter = higher AO.

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
  int mv = analogReadMilliVolts(AO_PIN);   // same reading in millivolts
  const char *label = ao < 500 ? "dark" : (ao < 2500 ? "room" : "bright");
  Serial.printf("AO=%4d  %4d mV  %s\n", ao, mv, label);   // dark/room/bright are rough guesses
  delay(300);
}
