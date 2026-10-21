/*
  BuiltByTyler Sensor Kit - S17 JOYSTICK (ALPS RKJXV 2-axis + push)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Prints the stick position (X, Y: 0..4095, about 2048 at rest) and the
  push switch (SW LOW = pressed; the pull-up is on the board).

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    X    -> GPIO 34
    Y    -> GPIO 35
    SW   -> GPIO 4

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define X_PIN    34
#define Y_PIN    35
#define SW_PIN   4

void setup() {
  Serial.begin(115200);
  pinMode(SW_PIN, INPUT);   // board pull-up: HIGH = released, LOW = pushed
}

void loop() {
  int x = analogRead(X_PIN);     // 0..4095
  int y = analogRead(Y_PIN);
  int sw = digitalRead(SW_PIN);
  Serial.printf("X=%4d Y=%4d SW=%d%s\n", x, y, sw, sw == LOW ? "  click" : "");
  delay(100);
}
