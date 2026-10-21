/*
  BuiltByTyler Sensor Kit - S11 TEMP + HUMIDITY (DHT11)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads temperature and humidity every 2 seconds.
  The DHT11 can't be read faster than once every 1-2 s.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    DATA -> GPIO 4

  Library: "DHT sensor library" (Adafruit; also installs "Adafruit Unified Sensor") (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define DATA_PIN 4

#include <DHT.h>

DHT dht(DATA_PIN, DHT11);    // fitted a DHT22 instead? change DHT11 to DHT22

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2000);                          // the sensor needs 2 s between reads
  float h = dht.readHumidity();         // %RH
  float t = dht.readTemperature();      // degrees C
  if (isnan(h) || isnan(t)) {
    Serial.println("Read failed - check the wiring");
    return;
  }
  Serial.printf("%.1f C  %.0f %%RH\n", t, h);
}
