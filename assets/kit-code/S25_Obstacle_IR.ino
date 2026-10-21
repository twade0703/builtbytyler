/*
  BuiltByTyler Sensor Kit - S25 OBSTACLE IR (IR LED + phototransistor)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Detects things 2-30 cm in front. DO goes LOW when something is there
  (set the distance with the pot). AO gives a rough 'how close' reading.

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
  int ao = analogRead(AO_PIN);        // 0..4095, lower = more IR bouncing back
  int dout = digitalRead(DO_PIN);     // LOW = obstacle
  Serial.printf("AO=%4d  DO=%d  %s\n", ao, dout, dout == LOW ? "OBSTACLE" : "clear");
  delay(200);
}
