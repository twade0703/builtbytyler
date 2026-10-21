/*
  BuiltByTyler Sensor Kit - S04 RELAY 5V (SRD-05VDC-SL-C)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Clicks the relay on for 2 s, off for 2 s. IN HIGH = coil on, COM-NO closed.
  Low voltage loads only (LED strips, pumps, fans). Never mains.
  The coil runs on 5 V from the VIN pin, so power the ESP32 over USB.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    5V   -> VIN (5V) - needs USB power
    IN   -> GPIO 18

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

void setup() {
  Serial.begin(115200);
  pinMode(IN_PIN, OUTPUT);
  digitalWrite(IN_PIN, LOW);     // start with the relay off
}

void loop() {
  digitalWrite(IN_PIN, HIGH);
  Serial.println("Relay ON  (COM-NO closed)");
  delay(2000);
  digitalWrite(IN_PIN, LOW);
  Serial.println("Relay OFF (COM-NC closed)");
  delay(2000);
}
