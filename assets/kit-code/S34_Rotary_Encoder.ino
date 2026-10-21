/*
  BuiltByTyler Sensor Kit - S34 ROTARY ENCODER (EC11 + push)
  Board: ESP32-WROOM-32 DevKit V1 (30-pin), Arduino-ESP32 core 3.x, "ESP32 Dev Module"

  Counts knob clicks (+ clockwise, - anticlockwise) and the push button.
  No library: we watch CLK, and when it falls, DT tells the direction.
  Pull-ups and debounce caps are on the board. SW = LOW when pushed.
  (Counting the wrong way? Swap the CLK and DT pin numbers.)

  Wiring (module pin -> ESP32 pin):
    GND  -> GND
    VCC  -> 3V3
    CLK  -> GPIO 4
    DT   -> GPIO 5
    SW   -> GPIO 16

  Library: none needed
  Serial Monitor: 115200 baud
*/

#define CLK_PIN  4
#define DT_PIN   5
#define SW_PIN   16

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
  if (clk != lastClk && clk == LOW) {        // CLK just fell = one click
    if (digitalRead(DT_PIN) == HIGH) pos++;  // DT still high = clockwise
    else pos--;
    Serial.printf("pos %ld %s\n", pos, digitalRead(DT_PIN) == HIGH ? "->" : "<-");
  }
  lastClk = clk;

  int sw = digitalRead(SW_PIN);
  if (sw == LOW && lastSw == HIGH) Serial.println("CLICK");
  lastSw = sw;
}
