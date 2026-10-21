/*
  BuiltByTyler Sensor Kit - S21 LINE TRACKER (TCRT5000)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Line sensor (faces the floor). DO is LOW over white and HIGH over a
  black line; turn the pot to set where it switches. AO helps you calibrate.

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
  int ao = analogRead(AO_PIN);        // 0..4095, higher = darker surface
  int dout = digitalRead(DO_PIN);     // HIGH = black line, LOW = white
  Serial.printf("AO=%4d  DO=%d  %s\n", ao, dout, dout == HIGH ? "LINE" : "white");
  delay(200);
}
