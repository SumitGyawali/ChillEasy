/*
 * VaxChain Monitor — NodeMCU ESP32 reference firmware
 * ----------------------------------------------------
 * Publishes telemetry to MQTT and subscribes to commands from the dashboard.
 * Optional HTTP fallback path also shown.
 *
 * Hardware (typical):
 *   - ESP32 (NodeMCU-32S)
 *   - Two DS18B20 sensors on GPIO 4 (one-wire bus)
 *   - Peltier driver on GPIO 25 (PWM via LEDC)
 *   - Battery sense on ADC GPIO 34 (voltage divider)
 *   - GPS NEO-6M on Serial2 (RX=16, TX=17)
 *
 * Dependencies (Arduino Library Manager):
 *   - WiFi.h, PubSubClient, ArduinoJson, OneWire, DallasTemperature, TinyGPSPlus
 *   - For HTTPS ingest path: HTTPClient (built-in)
 *
 * Topics (must match dashboard exactly):
 *   Telemetry:  vaxchain/<DEVICE_ID>/telemetry   (device → app)
 *   Commands:   vaxchain/<DEVICE_ID>/cmd         (app → device)
 *
 * Telemetry JSON schema (identical for MQTT and HTTP /api/ingest/<device_id>):
 *   { "sensor1": float, "sensor2": float, "pwm_pct": float,
 *     "battery_pct": float, "lat": float, "lng": float,
 *     "timestamp": "ISO8601" }
 *
 * Command JSON schema:
 *   { "type": "setpoint" | "excursion_test" | "reset", "value": <number|null> }
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <TinyGPSPlus.h>
#include <HTTPClient.h>
#include <time.h>

// ===================== CONFIG =====================
#define DEVICE_ID        "vx-001"
#define WIFI_SSID        "your-ssid"
#define WIFI_PASS        "your-pass"

// MQTT (HiveMQ public broker over WebSocket TLS won't work directly from ESP32;
// use plain MQTT TCP on port 1883/8883 here, while the dashboard uses WSS 8884.
// Both endpoints serve the same broker.)
#define MQTT_HOST        "broker.hivemq.com"
#define MQTT_PORT        1883
#define MQTT_TOPIC_PREF  "vaxchain"

// HTTP fallback (use this if your network blocks MQTT)
#define USE_HTTP_FALLBACK 0
#define HTTP_INGEST_URL  "https://YOUR-DASHBOARD-HOST/api/ingest/" DEVICE_ID
#define HTTP_CMD_URL     "https://YOUR-DASHBOARD-HOST/api/devices/" DEVICE_ID "/commands"

// Pins
#define ONEWIRE_PIN      4
#define PELTIER_PWM_PIN  25
#define BATTERY_ADC_PIN  34

// Control
float g_setpoint   = 5.0;     // °C
bool  g_excursion  = false;   // demo flag
unsigned long g_excursion_until = 0;

// ===================== Globals =====================
WiFiClient    espClient;
PubSubClient  mqtt(espClient);
OneWire       oneWire(ONEWIRE_PIN);
DallasTemperature sensors(&oneWire);
TinyGPSPlus   gps;
HardwareSerial GPSSerial(2);

DeviceAddress addr1, addr2;

// ===================== Helpers =====================
String isoNow() {
  time_t now = time(nullptr);
  struct tm tm; gmtime_r(&now, &tm);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return String(buf);
}

float readBatteryPct() {
  // ADC 0..4095 ≈ 0..3.3V; with a 1:1 divider on a 3.7V Li-ion -> 0..6.6V.
  // Map 3.3V (empty) → 0%, 4.2V (full) → 100%.
  int raw = analogRead(BATTERY_ADC_PIN);
  float v = (raw / 4095.0f) * 3.3f * 2.0f;
  float pct = (v - 3.3f) / (4.2f - 3.3f) * 100.0f;
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return pct;
}

float pidUpdate(float current, float target) {
  // Trivial P controller: PWM proportional to error (cooling more when warmer).
  float err = current - target;
  float pwm = 25.0f + err * 12.0f;
  if (pwm < 0) pwm = 0; if (pwm > 100) pwm = 100;
  // Apply PWM via LEDC channel 0 (set up in setup())
  uint32_t duty = (uint32_t)(pwm * 255.0f / 100.0f);
  ledcWrite(0, duty);
  return pwm;
}

// ===================== MQTT =====================
void onCommand(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload, length)) return;
  const char* t = doc["type"] | "";
  if (!strcmp(t, "setpoint")) {
    g_setpoint = doc["value"].as<float>();
  } else if (!strcmp(t, "excursion_test")) {
    g_excursion = true;
    g_excursion_until = millis() + 5UL * 60 * 1000;  // 5 minutes
  } else if (!strcmp(t, "reset")) {
    delay(200); ESP.restart();
  }
}

void mqttReconnect() {
  while (!mqtt.connected()) {
    String cid = String("vx-") + DEVICE_ID + "-" + String((uint32_t)esp_random(), HEX);
    if (mqtt.connect(cid.c_str())) {
      String topic = String(MQTT_TOPIC_PREF) + "/" + DEVICE_ID + "/cmd";
      mqtt.subscribe(topic.c_str(), 0);
      return;
    }
    delay(2000);
  }
}

// ===================== HTTP fallback =====================
void httpIngest(const String& json) {
  HTTPClient http;
  http.begin(HTTP_INGEST_URL);
  http.addHeader("Content-Type", "application/json");
  http.POST(json);
  http.end();
}

void httpFetchCommands() {
  HTTPClient http;
  http.begin(HTTP_CMD_URL);
  int code = http.GET();
  if (code == 200) {
    StaticJsonDocument<1024> doc;
    if (!deserializeJson(doc, http.getString())) {
      for (JsonObject c : doc["commands"].as<JsonArray>()) {
        const char* t = c["type"] | "";
        if (!strcmp(t, "setpoint"))         g_setpoint = c["value"].as<float>();
        else if (!strcmp(t, "excursion_test")) { g_excursion = true; g_excursion_until = millis() + 5UL*60*1000; }
        else if (!strcmp(t, "reset"))       { delay(200); ESP.restart(); }
      }
    }
  }
  http.end();
}

// ===================== Setup =====================
void setup() {
  Serial.begin(115200);
  GPSSerial.begin(9600, SERIAL_8N1, 16, 17);
  pinMode(BATTERY_ADC_PIN, INPUT);
  ledcSetup(0, 25000, 8);
  ledcAttachPin(PELTIER_PWM_PIN, 0);

  sensors.begin();
  sensors.getAddress(addr1, 0);
  sensors.getAddress(addr2, 1);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);

  configTime(0, 0, "pool.ntp.org");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
}

// ===================== Loop =====================
unsigned long lastTx = 0;
void loop() {
  // GPS pump
  while (GPSSerial.available()) gps.encode(GPSSerial.read());

  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();

  if (millis() - lastTx < 20000) return;  // 20s cadence — matches simulator
  lastTx = millis();

  // Read both probes
  sensors.requestTemperatures();
  float s1 = sensors.getTempC(addr1);
  float s2 = sensors.getTempC(addr2);

  // Demo excursion injection
  if (g_excursion) {
    if (millis() > g_excursion_until) g_excursion = false;
    else { s1 += 10; s2 += 10; }
  }

  float current = (s1 + s2) / 2.0f;
  float pwm = pidUpdate(current, g_setpoint);
  float bat = readBatteryPct();
  double lat = gps.location.isValid() ? gps.location.lat() : 0.0;
  double lng = gps.location.isValid() ? gps.location.lng() : 0.0;

  StaticJsonDocument<256> doc;
  doc["sensor1"]    = s1;
  doc["sensor2"]    = s2;
  doc["pwm_pct"]    = pwm;
  doc["battery_pct"]= bat;
  doc["lat"]        = lat;
  doc["lng"]        = lng;
  doc["timestamp"]  = isoNow();
  String payload; serializeJson(doc, payload);

  String topic = String(MQTT_TOPIC_PREF) + "/" + DEVICE_ID + "/telemetry";
  mqtt.publish(topic.c_str(), payload.c_str(), false);

  if (USE_HTTP_FALLBACK) {
    httpIngest(payload);
    httpFetchCommands();
  }
}
