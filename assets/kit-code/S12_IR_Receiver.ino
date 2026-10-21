/*
  BuiltByTyler Sensor Kit - S12 IR RECEIVER (TSOP38238 38 kHz)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Point any TV remote at the receiver and press a key: prints the
  protocol, address and command. Copy them into the S13 sketch to resend.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    OUT  -> GPIO 4

  Library: "IRremote" by Armin Joachimsmeyer, 4.4 or newer (needed for ESP32 core 3.x) (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define OUT_PIN  4

#include <IRremote.hpp>

void setup() {
  Serial.begin(115200);
  IrReceiver.begin(OUT_PIN, DISABLE_LED_FEEDBACK);   // start listening
  Serial.println("Point a remote at the receiver and press a key");
}

void loop() {
  if (IrReceiver.decode()) {                  // true when a full code arrived
    IrReceiver.printIRResultShort(&Serial);   // protocol, address, command
    Serial.print("Command = 0x");
    Serial.println(IrReceiver.decodedIRData.command, HEX);
    IrReceiver.resume();                      // ready for the next code
  }
}
