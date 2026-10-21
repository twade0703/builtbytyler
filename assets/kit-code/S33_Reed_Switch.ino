/*
  BuiltByTyler Sensor Kit - S33 REED SWITCH (Hamlin MDSR-4)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Prints when a magnet closes the reed switch. OUT = HIGH when closed.
  Door/window sensor: magnet on the door, board on the frame.

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
    Serial.println(s == HIGH ? "1  closed" : "0  open");
    last = s;
  }
  delay(10);
}
