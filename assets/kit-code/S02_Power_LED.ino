/*
  BuiltByTyler Sensor Kit - S02 POWER LED (1 W white emitter)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Fades the 1 W white LED up and down with PWM.
  Very bright: don't stare into it. It draws ~350 mA from 5 V, so power
  the ESP32 from a good USB port (5V comes from the VIN pin).

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    5V   -> VIN (5V) - needs USB power
    IN   -> GPIO 18

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

void setup() {
  Serial.begin(115200);
  // analogWrite sets the pin up for PWM by itself: 0 = off, 255 = full
}

void loop() {
  Serial.println("Fading up");
  for (int b = 0; b <= 255; b++) { analogWrite(IN_PIN, b); delay(8); }
  Serial.println("Fading down");
  for (int b = 255; b >= 0; b--) { analogWrite(IN_PIN, b); delay(8); }
  Serial.println("LED OFF");
  delay(1000);
}
