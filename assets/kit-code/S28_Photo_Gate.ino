/*
  BuiltByTyler Sensor Kit - S28 PHOTO GATE (ITR9608 slot)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Counts things passing through the slot. OUT goes HIGH when the slot is
  blocked. Prints the count each second, and RPM for a wheel with 1 slot/flag.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    OUT  -> GPIO 4

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define OUT_PIN  4

volatile unsigned long blocks = 0;    // changed inside the interrupt

void IRAM_ATTR onBlock() {             // runs every time OUT goes LOW -> HIGH
  blocks = blocks + 1;
}

void setup() {
  Serial.begin(115200);
  pinMode(OUT_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(OUT_PIN), onBlock, RISING);
}

void loop() {
  delay(1000);
  unsigned long n = blocks;   // grab and reset the count
  blocks = 0;
  const char *state = digitalRead(OUT_PIN) == HIGH ? "blocked" : "clear";
  Serial.printf("%s  %lu per second  RPM = %lu\n", state, n, n * 60);
}
