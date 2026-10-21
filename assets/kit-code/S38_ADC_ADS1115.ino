/*
  BuiltByTyler Sensor Kit - S38 ADC 16-BIT (ADS1115)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Reads all four inputs of the 16-bit ADS1115 (I2C 0x48) in volts.
  Wire A0-A3 to the AO pins of analog sensors powered from the same 3V3.
  Never put more than VCC on A0-A3. ALRT is optional and not used here.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    SDA  -> GPIO 21
    SCL  -> GPIO 22
    ALRT -> GPIO 4
    A0   -> AO pin of an analog sensor (optional)
    A1   -> AO pin of an analog sensor (optional)
    A2   -> AO pin of an analog sensor (optional)
    A3   -> AO pin of an analog sensor (optional)

  Library: "Adafruit ADS1X15" (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define SDA_PIN  21
#define SCL_PIN  22
#define ALRT_PIN 4

#include <Wire.h>
#include <Adafruit_ADS1X15.h>

Adafruit_ADS1115 ads;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!ads.begin(0x48)) {
    Serial.println("ADS1115 not found at 0x48 - check the wiring");
    while (true) delay(1000);
  }
  ads.setGain(GAIN_ONE);   // +/-4.096 V range: fits 0-3.3 V signals
}

void loop() {
  for (int ch = 0; ch < 4; ch++) {
    int16_t raw = ads.readADC_SingleEnded(ch);
    Serial.printf("A%d=%.3f V  ", ch, ads.computeVolts(raw));
  }
  Serial.println();
  delay(500);
}
