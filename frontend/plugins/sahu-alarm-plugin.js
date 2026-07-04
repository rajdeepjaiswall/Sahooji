/**
 * Sahu Alarm — Expo Config Plugin
 *
 * Merges into the app manifest:
 *  - all runtime + install-time permissions required by the alarm layer
 *  - MainActivity attributes (showWhenLocked / turnScreenOn / singleTask)
 *  - queries entries for tel:/sms:/whatsapp: intent resolution
 *
 * The Kotlin native module in ./modules/sahu-alarm/ already merges its own
 * activity / service / receiver declarations via its module AndroidManifest.xml,
 * so we don't need to duplicate those here.
 */

const {
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");

const REQUIRED_PERMISSIONS = [
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.DISABLE_KEYGUARD",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.READ_CONTACTS",
  "android.permission.CALL_PHONE",
  "android.permission.SEND_SMS",
];

const REQUIRED_QUERIES = [
  { scheme: "tel" },
  { scheme: "sms" },
  { scheme: "smsto" },
  { scheme: "mailto" },
  { scheme: "https", host: "wa.me" },
  { scheme: "whatsapp" },
];

function ensurePermissions(manifest) {
  manifest["uses-permission"] = manifest["uses-permission"] || [];
  const have = new Set(
    manifest["uses-permission"]
      .map((p) => p.$?.["android:name"])
      .filter(Boolean),
  );
  for (const name of REQUIRED_PERMISSIONS) {
    if (!have.has(name)) {
      manifest["uses-permission"].push({ $: { "android:name": name } });
    }
  }
}

function ensureQueries(manifest) {
  if (!manifest.queries) manifest.queries = [{}];
  const q = manifest.queries[0] || {};
  manifest.queries[0] = q;
  q.intent = q.intent || [];
  const have = new Set(
    q.intent
      .map((i) => {
        const data = i.data?.[0]?.$?.["android:scheme"];
        const host = i.data?.[0]?.$?.["android:host"];
        return `${data || ""}:${host || ""}`;
      })
      .filter(Boolean),
  );
  for (const s of REQUIRED_QUERIES) {
    const key = `${s.scheme}:${s.host || ""}`;
    if (have.has(key)) continue;
    q.intent.push({
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      data: [
        {
          $: {
            "android:scheme": s.scheme,
            ...(s.host ? { "android:host": s.host } : {}),
          },
        },
      ],
    });
  }
}

function ensureMainActivity(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
    /** @type {any} */ ({ manifest }),
  );
  const activities = app.activity || [];
  for (const activity of activities) {
    const name = activity.$?.["android:name"];
    if (name === ".MainActivity" || name?.endsWith(".MainActivity")) {
      activity.$["android:launchMode"] = "singleTask";
      activity.$["android:showWhenLocked"] = "true";
      activity.$["android:turnScreenOn"] = "true";
    }
  }
}

const withSahuAlarm = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    ensurePermissions(manifest);
    ensureQueries(manifest);
    ensureMainActivity(manifest);
    return cfg;
  });
};

module.exports = withSahuAlarm;
