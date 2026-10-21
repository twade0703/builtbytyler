/*
  BuiltByTyler Sensor Kit - S24 SOUND (Electret + MCP6002)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Sound level meter + clap detector. AO is real amplified audio around
  VCC/2; we measure how far it swings in 100 ms. DO goes HIGH on a loud
  sound (set the trigger level with the pot).

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    AO   -> GPIO 34
    DO   -> GPIO 4

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define AO_PIN   34
#define DO_PIN   4

void setup() {
  Serial.begin(115200);
  pinMode(DO_PIN, INPUT);
}

void loop() {
  int lo = 4095, hi = 0;
  bool loud = false;
  unsigned long start = millis();
  while (millis() - start < 100) {        // listen for 100 ms
    int v = analogRead(AO_PIN);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (digitalRead(DO_PIN) == HIGH) loud = true;
  }
  int level = (hi - lo) * 100 / 4095;      // swing as % of full scale
  Serial.printf("level %d%%%s\n", level, loud ? "  DO=1  CLAP!" : "");
}
