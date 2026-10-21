/*
  BuiltByTyler Sensor Kit - S05 ACCEL 3-AXIS (ADXL345)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Prints X, Y and Z acceleration in g, 5 times a second.
  Flat on the table you should see about z=1.00 g (that's gravity).
  I2C address 0x53. INT is optional (tap / free-fall) and not used here.

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    SDA  -> GPIO 21
    SCL  -> GPIO 22
    INT  -> GPIO 4

  Library: "Adafruit ADXL345" (also installs "Adafruit Unified Sensor") (Sketch > Include Library > Manage Libraries)
  Serial Monitor: 115200 baud
*/

#define SDA_PIN  21
#define SCL_PIN  22
#define INT_PIN  4

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!accel.begin(0x53)) {
    Serial.println("ADXL345 not found at 0x53 - check the wiring");
    while (true) delay(1000);
  }
  accel.setRange(ADXL345_RANGE_4_G);   // +/-4 g is plenty for tilting and shaking
}

void loop() {
  sensors_event_t e;
  accel.getEvent(&e);                  // results come in m/s^2
  const float G = 9.80665;             // 1 g in m/s^2
  Serial.printf("x=%.2f y=%.2f z=%.2f g\n",
                e.acceleration.x / G, e.acceleration.y / G, e.acceleration.z / G);
  delay(200);
}
