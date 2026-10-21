/*
  BuiltByTyler Sensor Kit - S34 ROTARY ENCODER (EC11 + push)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Counts knob clicks (+ clockwise, - anticlockwise) and the push button.
  No library: we watch CLK, and every time it changes, DT tells the direction.
  The Alps EC11E15244G1 has 30 clicks and 15 pulses per turn, so CLK changes
  once per click (it falls on one click and rises on the next): count both edges.
  Pull-ups and debounce caps are on the board. SW = LOW when pushed.
  (Counting the wrong way? Swap the CLK and DT pin numbers.)

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    CLK  -> GPIO 4  (D4)
    DT   -> GPIO 16 (RX2)
    SW   -> GPIO 17 (TX2)

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define CLK_PIN  4
#define DT_PIN   16    // not GPIO 5: that is a boot strapping pin
#define SW_PIN   17

long pos = 0;
int lastClk, lastSw;

void setup() {
  Serial.begin(115200);
  pinMode(CLK_PIN, INPUT);
  pinMode(DT_PIN, INPUT);
  pinMode(SW_PIN, INPUT);
  lastClk = digitalRead(CLK_PIN);
  lastSw = digitalRead(SW_PIN);
}

void loop() {
  int clk = digitalRead(CLK_PIN);
  if (clk != lastClk) {                      // CLK changed = one click
    bool cw = digitalRead(DT_PIN) != clk;    // DT not yet following CLK = clockwise
    if (cw) pos++;
    else pos--;
    Serial.printf("pos %ld %s\n", pos, cw ? "->" : "<-");
  }
  lastClk = clk;

  int sw = digitalRead(SW_PIN);
  if (sw == LOW && lastSw == HIGH) Serial.println("CLICK");
  lastSw = sw;
}
