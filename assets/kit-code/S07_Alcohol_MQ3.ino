/*
  BuiltByTyler Sensor Kit - S07 ALCOHOL MQ-3 (MQ-3)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Prints the MQ-3 alcohol level (AO) and the alarm output (DO).
  DO goes LOW when the level passes the threshold set by the blue pot.
  Heater runs on 5 V (VIN, so USB power); AO/DO stay under 3.3 V (ESP32-safe).
  Needs 24-48 h burn-in for accurate numbers and ~1 min warm-up every time.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    5V   -> VIN (5V) - needs USB power
    AO   -> GPIO 34
    DO   -> GPIO 4

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define AO_PIN   34
#define DO_PIN   4

void setup() {
  Serial.begin(115200);
  pinMode(DO_PIN, INPUT);   // DO has a pull-up on the board
  Serial.println("MQ-3 heating up: wait ~1 minute before trusting the readings");
}

void loop() {
  int ao = analogRead(AO_PIN);              // 0..4095, more gas = higher
  int mv = analogReadMilliVolts(AO_PIN);    // the same reading in millivolts
  int dout = digitalRead(DO_PIN);           // LOW = above the blue pot's threshold
  Serial.printf("AO=%d (%d mV)  DO=%d%s\n", ao, mv, dout, dout == LOW ? "  ALERT" : "");
  delay(500);
}
