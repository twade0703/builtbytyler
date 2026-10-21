/*
  BuiltByTyler Sensor Kit - S18 KNOCK (Spring vibration switch)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Counts knocks. The spring switch closes for a moment on a tap; the board
  stretches that into a short HIGH pulse on OUT.

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
  pinMode(OUT_PIN, INPUT);   // pull-down on the board: LOW when quiet
}

int last = LOW;
int knocks = 0;

void loop() {
  int s = digitalRead(OUT_PIN);
  if (s == HIGH && last == LOW) {   // the pulse just started = one knock
    knocks++;
    Serial.printf("1  knock! (%d)\n", knocks);
    delay(50);                      // ignore the spring ringing for a moment
  }
  last = s;
}
