/*
  BuiltByTyler Sensor Kit - S31 PULSE (Green LED + TEMT6000 + MCP6001)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Rest a fingertip lightly on the sensor and keep still. AO swings around
  VCC/2 with each heartbeat; we call it a beat when the signal rises above
  its own slow average, then work out BPM. Not a medical device.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    AO   -> GPIO 34

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define AO_PIN   34

const int THRESHOLD = 100;     // how far above average counts as a beat (tune me)
float avg = 2048;              // slow-moving centre line
bool above = false;
unsigned long lastBeat = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int v = analogRead(AO_PIN);
  avg = avg * 0.98 + v * 0.02;               // follows the slow drift only
  if (!above && v > avg + THRESHOLD) {       // rising edge = heartbeat
    above = true;
    unsigned long now = millis();
    unsigned long gap = now - lastBeat;
    if (gap > 300 && gap < 2000) Serial.printf("beat  %lu BPM\n", 60000UL / gap);
    else Serial.println("beat");
    lastBeat = now;
  }
  if (above && v < avg) above = false;       // back below = ready for the next one
  delay(20);                                 // 50 samples per second
}
