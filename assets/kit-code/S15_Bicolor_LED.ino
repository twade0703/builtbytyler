/*
  BuiltByTyler Sensor Kit - S15 2-COLOR LED (Red / green 5 mm)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Shows red, green, both (yellow-ish), then off. HIGH = on.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    R    -> GPIO 25
    G    -> GPIO 26

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define R_PIN    25
#define G_PIN    26

void show(int r, int g, const char *name) {
  digitalWrite(R_PIN, r);
  digitalWrite(G_PIN, g);
  Serial.println(name);
  delay(1000);
}

void setup() {
  Serial.begin(115200);
  pinMode(R_PIN, OUTPUT);
  pinMode(G_PIN, OUTPUT);
}

void loop() {
  show(HIGH, LOW,  "RED");
  show(LOW,  HIGH, "GREEN");
  show(HIGH, HIGH, "RED+GREEN = yellow");
  show(LOW,  LOW,  "OFF");
}
