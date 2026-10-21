/*
  BuiltByTyler Sensor Kit - S03 RGB LED 5MM (Common cathode)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Cycles the 5 mm RGB LED through colours by mixing PWM on R, G and B.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    R    -> GPIO 25
    G    -> GPIO 26
    B    -> GPIO 27

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define R_PIN    25
#define G_PIN    26
#define B_PIN    27

// analogWrite sets each pin up for PWM by itself: 0 = off, 255 = full
void setColor(int r, int g, int b) {
  analogWrite(R_PIN, r);
  analogWrite(G_PIN, g);
  analogWrite(B_PIN, b);
  Serial.printf("R=%d G=%d B=%d\n", r, g, b);
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  setColor(255, 0, 0);  delay(1000);  // red
  setColor(0, 255, 0);  delay(1000);  // green
  setColor(0, 0, 255);  delay(1000);  // blue
  setColor(255, 120, 0);  delay(1000);  // orange
  setColor(255, 0, 255);  delay(1000);  // magenta
  setColor(255, 255, 255);  delay(1000);  // white
  setColor(0, 0, 0);  delay(1000);  // off
}
