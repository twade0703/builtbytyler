/*
  BuiltByTyler Sensor Kit - S27 BUZZER PASSIVE (12 mm magnetic transducer)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Plays C5-E5-G5-C6 on the passive buzzer with tone(). Any note works.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    IN   -> GPIO 18

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

const int notes[] = {523, 659, 784, 1047};   // C5 E5 G5 C6 in Hz
const char *names[] = {"C5", "E5", "G5", "C6"};

void setup() {
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    Serial.printf("%s %d Hz\n", names[i], notes[i]);
    tone(IN_PIN, notes[i]);   // square wave on the pin
    delay(250);
    noTone(IN_PIN);
    delay(50);
  }
  delay(1500);
}
