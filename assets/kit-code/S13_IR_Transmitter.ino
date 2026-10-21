/*
  BuiltByTyler Sensor Kit - S13 IR TRANSMITTER (940 nm LED)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Sends a NEC TV-remote code every 3 seconds (aim the LED at a TV).
  Use the S12 sketch to read your own remote, then put its address and
  command below. The library makes the 38 kHz carrier for you.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    IN   -> GPIO 18

  Library: "IRremote" by Armin Joachimsmeyer, 4.4 or newer (needed for ESP32 core 3.x) (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define IN_PIN   18

#include <IRremote.hpp>

const uint16_t ADDRESS = 0x04;   // example NEC code - replace with yours from S12
const uint8_t  COMMAND = 0x08;

void setup() {
  Serial.begin(115200);
  IrSender.begin(IN_PIN);        // IR LED driver on this pin
}

void loop() {
  Serial.printf("Sending NEC address 0x%02X command 0x%02X\n", ADDRESS, COMMAND);
  IrSender.sendNEC(ADDRESS, COMMAND, 0);   // 0 = no repeats
  delay(3000);
}
