/*
  BuiltByTyler Sensor Kit - S26 MOTION PIR (AM312 digital pyro)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Prints MOTION when someone moves within ~3-5 m. OUT goes HIGH for ~2 s.
  Give it ~30 s after power-up to settle.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    OUT  -> GPIO 4

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define OUT_PIN  4

void setup() {
  Serial.begin(115200);
  pinMode(OUT_PIN, INPUT);   // the board has its own pull resistor, so plain INPUT
}

int last = -1;   // last state we printed (-1 = nothing yet)

void loop() {
  int s = digitalRead(OUT_PIN);
  if (s != last) {             // only print when something changes
    Serial.println(s == HIGH ? "1  MOTION" : "0  quiet");
    last = s;
  }
  delay(10);
}
