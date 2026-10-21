/*
  BuiltByTyler Sensor Kit - S01 TEMP 1-WIRE (DS18B20)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads the DS18B20 digital thermometer once a second and prints degrees C.
  The 4.7k pull-up is on the board, no extra resistor needed.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    DQ   -> GPIO 4

  Library: "OneWire" (Paul Stoffregen, 2.3.8 or newer) + "DallasTemperature" (Miles Burton) (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define DQ_PIN   4

#include <OneWire.h>
#include <DallasTemperature.h>

OneWire oneWire(DQ_PIN);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(115200);
  sensors.begin();                           // finds every DS18B20 on the wire
  Serial.print("Sensors found: ");
  Serial.println(sensors.getDeviceCount());
}

void loop() {
  sensors.requestTemperatures();             // start a reading (~750 ms at 12-bit)
  float c = sensors.getTempCByIndex(0);      // first sensor on the wire
  if (c == DEVICE_DISCONNECTED_C) {
    Serial.println("No sensor found - check the wiring");
  } else {
    Serial.printf("Temp: %.1f C\n", c);
  }
  delay(1000);
}
