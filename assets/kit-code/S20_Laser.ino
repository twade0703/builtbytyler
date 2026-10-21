/*
  BuiltByTyler Sensor Kit - S20 LASER 650NM (Class 2 (<1 mW))
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Blinks the red laser: 1 s on, 1 s off. IN HIGH = on.
  Class 2 laser: NEVER point it at anyone's eyes (or your own).

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    IN   -> GPIO 18

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

void setup() {
  Serial.begin(115200);
  pinMode(IN_PIN, OUTPUT);
  digitalWrite(IN_PIN, LOW);   // start with the laser off
}

void loop() {
  digitalWrite(IN_PIN, HIGH);
  Serial.println("LASER ON");
  delay(1000);
  digitalWrite(IN_PIN, LOW);
  Serial.println("LASER OFF");
  delay(1000);
}
