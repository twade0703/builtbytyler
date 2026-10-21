/*
  BuiltByTyler Sensor Kit - S06 BUZZER ACTIVE (12 mm, built-in oscillator)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Beeps the active buzzer: one beep, pause, two beeps. IN HIGH = beep.
  It has its own oscillator, so a plain digitalWrite is all it needs.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    IN   -> GPIO 18

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

void beep(int ms) {
  digitalWrite(IN_PIN, HIGH);
  delay(ms);
  digitalWrite(IN_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(IN_PIN, OUTPUT);
  digitalWrite(IN_PIN, LOW);
}

void loop() {
  Serial.println("BEEP");
  beep(200);
  delay(1000);
  Serial.println("BEEP BEEP");
  beep(100); delay(100); beep(100);
  delay(1500);
}
