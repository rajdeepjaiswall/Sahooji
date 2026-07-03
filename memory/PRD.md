# Sahu Sales Solution — PRD

## Overview
Internal sales management app for a sales team (admin + team members). Core loop:
save client contacts → create events (calls, demos, payment collections, AMC renewals) →
attach reminders → when a reminder is due the phone rings and the screen takes over like
an incoming call → salesman acts (End / Snooze / Assign / WhatsApp / Call / SMS) →
activity feed logs everything → invoices generated as PDF and shared via WhatsApp.

## Tech stack
- **Frontend:** React Native + Expo (SDK 54, expo-router), light theme only.
- **Backend:** FastAPI + MongoDB (motor).
- **Auth:** JWT (access + refresh), first registered user auto-becomes admin.
- **PDF:** `expo-print` + `expo-sharing`.
- **Alarm (in-app):** 30-second polling loop + full-screen `Modal` takeover (works while
  the app is open). The native Android alarm layer (AlarmManager, FullScreenIntent,
  BubbleActivity, overlay pill, KeepAlive service, autostart deep-links) is designed
  as an **Expo Config Plugin** that ships with the APK build — it CANNOT run in Expo Go
  or the preview environment.

## Screens
- `/login`, `/register` (with Phone Optimisation panel)
- `/(tabs)` 5-tab bottom nav: Dashboard, Contacts, Events, Invoices, Team
- `/settings`, `/debug` (hidden — tap the water-drop 7×), `/products`
- `/contact/[id]` (new or edit), `/event/[id]`, `/invoice/[id]`

## Data model (MongoDB collections)
- `profiles` (id, email, password_hash, full_name, organisation_name, mobile, role,
  permissions, is_disabled, ringtone_url, vibrate, floating_assistant, refresh_jti_hash)
- `event_tags`, `contacts`, `events`, `reminders`, `products`, `invoices`,
  `reminder_activity`, `team_invites`

## API endpoints (all prefixed `/api`)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
  `GET /auth/me`, `PATCH /auth/me`, `POST /auth/password-change`
- Contacts: `GET/POST /contacts`, `POST /contacts/bulk`, `GET/PATCH/DELETE /contacts/{id}`
- Events: `GET/POST /events`, `GET /events/{id}`, `PATCH /events/{id}/status`,
  `DELETE /events/{id}` (reminders are nested)
- Reminders: `GET /reminders`, `POST /reminders/{id}/action` (snoozed/ended/delegated/triggered)
- Activity: `GET /activity`
- Products: `GET/POST /products`, `PATCH/DELETE /products/{id}`
- Invoices: `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/{id}`
  (auto invoice number `INV-YYYYMM-NNN`, Indian FY computed)
- Team: `GET/POST /team`, `PATCH /team/{id}`, `POST /team/{id}/reset-password`
- Health/Debug: `GET /health`, `GET /debug/counts`

## Native alarm layer (delivered as Expo Config Plugin, APK-only)
The full-screen alarm takeover that fires when the phone is locked and the app is killed
requires the following native Android components. They CANNOT be tested in Expo Go or
the web preview. This is intentional and documented for the user.

Components (native Java, package `com.sahusalessolution.app`):
1. `AlarmScheduler` — schedules alarms via `AlarmManager.setAlarmClock()`; persists to
   SharedPreferences; reschedule-all helper.
2. `AlarmReceiver` — plays sound via static looping Ringtone (USAGE_ALARM), builds a
   HIGH-importance notification with `setFullScreenIntent`, publishes a Bubble
   (Android 11+), draws a Dynamic-Island-style pill overlay, and attempts direct
   `startActivity` in try/catch.
3. `AlarmActivity` — `setShowWhenLocked(true) + setTurnScreenOn(true)`, gradient
   background per event tag, END / SNOOZE / ASSIGN / WhatsApp / Call / SMS buttons,
   volume-keys PANIC MUTE keeps screen visible.
4. `AlarmActionReceiver` — notification / bubble / pill Snooze + Cancel handlers
   with backend sync on next app open.
5. `BootReceiver` — reschedules all persisted alarms on boot.
6. `KeepAlive ForegroundService` (START_STICKY, foregroundServiceType specialUse) —
   keeps the process alive against OEM killers.
7. `MainActivity` — runs the sequential native permission chain
   (POST_NOTIFICATIONS → SCHEDULE_EXACT_ALARM → USE_FULL_SCREEN_INTENT →
   SYSTEM_ALERT_WINDOW → REQUEST_IGNORE_BATTERY_OPTIMIZATIONS + OEM autostart).
8. `FloatingAssistantService` — draggable 52dp blue water-drop bubble via WindowManager.

The in-app fallback (`AlarmTakeover` + `ReminderAlarmProvider`) delivers the same UX
whenever the app is currently open, which is what runs in Expo Go / web preview.

## Non-functional requirements
- Mobile-first, 44pt touch targets, Inter font, brand #1565C0.
- Zero silent failures — every mutation surfaces a real backend error via toast.
- Session persists across restarts (via `expo-secure-store`).
- Debug page reachable by tapping the water-drop 7×.
