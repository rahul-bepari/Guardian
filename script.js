'use strict';
/* ============================================================
   GUARDIAN — script.js
   ------------------------------------------------------------
   Internal sections, in order:
     0.  i18n              — English / Bangla strings
     1.  db                — IndexedDB (contacts, settings, pending alerts)
     2.  state              — shared in-memory app state
     3.  geolocation         — battery-conscious watchPosition wrapper
     4.  safe-walk-timer     — timer flow + missed check-in alerting
     5.  silent-sos          — discreet trigger detection + alert dispatch
     6.  fake-call           — Web Audio ringtone + call UI
     7.  live-share          — Supabase realtime location broadcast
     8.  contacts            — contact list UI + test alert mode
     9.  pwa                 — service worker registration, install prompt
     10. ui / navigation / init

   HONESTY NOTE (read this before relying on the app):
   Web pages cannot silently send an SMS or place a phone call —
   browsers require the person to tap "Send" in their own
   Messaging app; JavaScript can open that app pre-filled, but it
   can never press Send for them. Every place in this file that
   "sends an alert" really means "prepares a message and opens
   the SMS composer for it" (`sms:` link), plus, when a Supabase
   backend is configured, a genuinely silent network alert. The
   in-app comments call this out at each call site so it stays
   honest rather than implying more than a browser can do.
   ============================================================ */

/* ============================================================
   0. i18n
   ============================================================ */
const STRINGS = {
  en: {
    greetingMorning: 'Good morning', greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening', greetingNight: 'Good night',
    quickNoteLabel: 'Quick note',
    quickNoteBody: 'Tap "Walk" below before you head out, and set when you expect to arrive.',
    navHome: 'Home', navWalk: 'Walk', navWalkSub: 'Not started',
    navWalkSubActive: 'Active — check in by {{time}}',
    navCall: 'Quick call', navCallSub: 'Simulate an incoming call',
    navShare: 'Share location', navShareSub: 'Let someone follow your trip',
    navContacts: 'Contacts', navContactsSub: 'No contacts yet',
    navContactsSubCount: '{{count}} saved', navSettings: 'Settings',
    walkTitle: 'Walk', walkDestLabel: 'Where are you headed? (optional)',
    walkDestPlaceholder: 'e.g. Home from bus stop',
    walkEtaLabel: 'Expect to arrive in', minutesUnit: 'min',
    walkContactsHint: 'Alerts go to your saved emergency contacts.',
    walkNoContactsHint: 'Add an emergency contact first, in Contacts.',
    walkStart: 'Start Safe Walk',
    walkArriveBy: 'Check in by', gpsAcquiring: 'Finding your location…',
    gpsActive: 'Location updating in the background',
    gpsDenied: 'Location access was denied — alerts will go out without a map link.',
    walkArrivedSafe: 'I\u2019m Safe / Arrived', walkAddTime: '+10 min',
    walkCancel: 'Cancel walk',
    alertSentTitle: 'Alert sent to your contacts',
    alertSentDetail: 'You didn\u2019t check in by your arrival time, so Guardian prepared alerts with your last known location.',
    ok: 'OK', sendTo: 'Send to {{name}}', sent: 'Sent',
    sosToastSending: 'Sending…', sosToastSent: 'Alert sent',
    sosToastCanceled: 'Canceled',
    fcIncoming: 'Incoming call', fcDecline: 'Decline', fcAnswer: 'Answer',
    fcMute: 'Mute', fcKeypad: 'Keypad', fcSpeaker: 'Speaker',
    shareTitle: 'Share location',
    shareIntro: 'Generate a private link that shows your live position for a set time. Needs an internet connection.',
    shareDurationLabel: 'Share for', shareStart: 'Start sharing',
    shareActiveHint: 'Anyone with this link can see your live position until it expires.',
    shareCopy: 'Copy', shareCopied: 'Copied',
    shareExpiresLabel: 'Expires at', shareStop: 'Stop sharing',
    shareNoBackend: 'Add Supabase details in Settings to turn on live sharing.',
    viewerTitle: 'Live location', viewerConnecting: 'Connecting…',
    viewerWaiting: 'Waiting for the first location update…',
    viewerExpired: 'This share has expired.',
    viewerUpdated: 'Last updated {{time}}',
    contactsTitle: 'Emergency contacts',
    contactNameLabel: 'Name', contactPhoneLabel: 'Phone number',
    contactPhonePlaceholder: '+8801XXXXXXXXX', contactAdd: 'Add contact',
    contactRemove: 'Remove',
    testAlert: 'Send test alert',
    testAlertHint: 'Sends a clearly labeled TEST message so you can confirm everything works before you rely on it.',
    pendingAlertsLabel: 'Not yet sent',
    settingsTitle: 'Settings', settingsLanguage: 'Language',
    settingsFakeCaller: 'Fake call details', fcNameLabel: 'Caller name',
    fcNumberLabel: 'Caller number',
    settingsBackend: 'Live share backend (optional)',
    settingsBackendHint: 'Only needed for live map sharing. Create a free Supabase project and paste its details here. Everything else in Guardian works without this.',
    save: 'Save', saved: 'Saved',
    defaultCallerName: 'Mom', defaultCallerNumber: '+880 1XXX XXXXXX',
    smsMissedCheckin: 'Guardian alert: {{name}} hasn\u2019t checked in as arrived safe. Expected by {{time}}{{dest}}. Last known location: {{map}}',
    smsSilentSos: 'Guardian alert: {{name}} may need help right now. Location: {{map}}',
    smsTest: '[TEST — please ignore] This is a Guardian test alert from {{name}}. Location: {{map}}',
    destSuffix: ', heading to {{dest}}',
    noLocation: 'location unavailable',
    installPrompt: 'Add Guardian to your home screen for faster, offline access.',
    install: 'Install', dismiss: 'Not now'
  },
  bn: {
    greetingMorning: 'শুভ সকাল', greetingAfternoon: 'শুভ অপরাহ্ন',
    greetingEvening: 'শুভ সন্ধ্যা', greetingNight: 'শুভ রাত্রি',
    quickNoteLabel: 'সংক্ষিপ্ত নোট',
    quickNoteBody: 'বের হওয়ার আগে নিচে "হাঁটা" চাপুন এবং কখন পৌঁছাবেন তা সেট করুন।',
    navHome: 'হোম', navWalk: 'হাঁটা', navWalkSub: 'শুরু হয়নি',
    navWalkSubActive: 'চলছে — {{time}} এর মধ্যে জানাতে হবে',
    navCall: 'দ্রুত কল', navCallSub: 'একটি ইনকামিং কল অনুকরণ করুন',
    navShare: 'অবস্থান শেয়ার', navShareSub: 'কাউকে আপনার যাত্রা অনুসরণ করতে দিন',
    navContacts: 'জরুরি যোগাযোগ', navContactsSub: 'এখনো কোনো যোগাযোগ নেই',
    navContactsSubCount: '{{count}} জন সংরক্ষিত', navSettings: 'সেটিংস',
    walkTitle: 'হাঁটা', walkDestLabel: 'আপনি কোথায় যাচ্ছেন? (ঐচ্ছিক)',
    walkDestPlaceholder: 'যেমন: বাস স্ট্যান্ড থেকে বাসায়',
    walkEtaLabel: 'কতক্ষণে পৌঁছাবেন বলে আশা করছেন', minutesUnit: 'মিনিট',
    walkContactsHint: 'সতর্কতা আপনার সংরক্ষিত জরুরি যোগাযোগে পাঠানো হবে।',
    walkNoContactsHint: 'প্রথমে যোগাযোগ পাতায় একটি জরুরি যোগাযোগ যোগ করুন।',
    walkStart: 'নিরাপদ হাঁটা শুরু করুন',
    walkArriveBy: 'যে সময়ের মধ্যে জানাতে হবে', gpsAcquiring: 'আপনার অবস্থান খোঁজা হচ্ছে…',
    gpsActive: 'পেছনে অবস্থান হালনাগাদ হচ্ছে',
    gpsDenied: 'অবস্থান অনুমতি দেওয়া হয়নি — সতর্কতায় মানচিত্র লিংক থাকবে না।',
    walkArrivedSafe: 'আমি নিরাপদ / পৌঁছে গেছি', walkAddTime: '+১০ মিনিট',
    walkCancel: 'হাঁটা বাতিল করুন',
    alertSentTitle: 'আপনার যোগাযোগে সতর্কতা পাঠানো হয়েছে',
    alertSentDetail: 'আপনি নির্ধারিত সময়ে নিরাপদে পৌঁছানোর কথা জানাননি, তাই Guardian আপনার সর্বশেষ জানা অবস্থানসহ সতর্কতা প্রস্তুত করেছে।',
    ok: 'ঠিক আছে', sendTo: '{{name}}-কে পাঠান', sent: 'পাঠানো হয়েছে',
    sosToastSending: 'পাঠানো হচ্ছে…', sosToastSent: 'সতর্কতা পাঠানো হয়েছে',
    sosToastCanceled: 'বাতিল হয়েছে',
    fcIncoming: 'ইনকামিং কল', fcDecline: 'প্রত্যাখ্যান', fcAnswer: 'উত্তর দিন',
    fcMute: 'নীরব', fcKeypad: 'কীপ্যাড', fcSpeaker: 'স্পিকার',
    shareTitle: 'অবস্থান শেয়ার করুন',
    shareIntro: 'একটি ব্যক্তিগত লিংক তৈরি করুন যা নির্দিষ্ট সময়ের জন্য আপনার লাইভ অবস্থান দেখায়। ইন্টারনেট সংযোগ প্রয়োজন।',
    shareDurationLabel: 'যত সময়ের জন্য শেয়ার করবেন', shareStart: 'শেয়ার শুরু করুন',
    shareActiveHint: 'এই লিংকযুক্ত যে কেউ মেয়াদ শেষ না হওয়া পর্যন্ত আপনার লাইভ অবস্থান দেখতে পারবে।',
    shareCopy: 'কপি করুন', shareCopied: 'কপি হয়েছে',
    shareExpiresLabel: 'মেয়াদ শেষ হবে', shareStop: 'শেয়ার বন্ধ করুন',
    shareNoBackend: 'লাইভ শেয়ারিং চালু করতে সেটিংসে Supabase তথ্য যোগ করুন।',
    viewerTitle: 'লাইভ অবস্থান', viewerConnecting: 'সংযুক্ত হচ্ছে…',
    viewerWaiting: 'প্রথম অবস্থান হালনাগাদের অপেক্ষায়…',
    viewerExpired: 'এই শেয়ারের মেয়াদ শেষ হয়ে গেছে।',
    viewerUpdated: 'সর্বশেষ হালনাগাদ {{time}}',
    contactsTitle: 'জরুরি যোগাযোগ',
    contactNameLabel: 'নাম', contactPhoneLabel: 'ফোন নম্বর',
    contactPhonePlaceholder: '+৮৮০১XXXXXXXXX', contactAdd: 'যোগাযোগ যোগ করুন',
    contactRemove: 'মুছুন',
    testAlert: 'পরীক্ষামূলক সতর্কতা পাঠান',
    testAlertHint: 'স্পষ্টভাবে চিহ্নিত একটি TEST বার্তা পাঠায়, যাতে নির্ভর করার আগে আপনি নিশ্চিত হতে পারেন সবকিছু ঠিকমতো কাজ করছে।',
    pendingAlertsLabel: 'এখনো পাঠানো হয়নি',
    settingsTitle: 'সেটিংস', settingsLanguage: 'ভাষা',
    settingsFakeCaller: 'ফেক কল তথ্য', fcNameLabel: 'কলারের নাম',
    fcNumberLabel: 'কলারের নম্বর',
    settingsBackend: 'লাইভ শেয়ার ব্যাকএন্ড (ঐচ্ছিক)',
    settingsBackendHint: 'শুধু লাইভ ম্যাপ শেয়ারিংয়ের জন্য প্রয়োজন। একটি বিনামূল্যের Supabase প্রকল্প তৈরি করে তার তথ্য এখানে দিন। Guardian-এর বাকি সবকিছু এটি ছাড়াই কাজ করে।',
    save: 'সংরক্ষণ করুন', saved: 'সংরক্ষিত হয়েছে',
    defaultCallerName: 'মা', defaultCallerNumber: '+৮৮০ ১XXX XXXXXX',
    smsMissedCheckin: 'Guardian সতর্কতা: {{name}} নিরাপদে পৌঁছানোর কথা জানাননি। প্রত্যাশিত সময়: {{time}}{{dest}}। সর্বশেষ জানা অবস্থান: {{map}}',
    smsSilentSos: 'Guardian সতর্কতা: {{name}}-এর এখনই সাহায্য প্রয়োজন হতে পারে। অবস্থান: {{map}}',
    smsTest: '[পরীক্ষা — অনুগ্রহ করে উপেক্ষা করুন] এটি {{name}}-এর পক্ষ থেকে একটি Guardian পরীক্ষামূলক সতর্কতা। অবস্থান: {{map}}',
    destSuffix: ', {{dest}}-এর দিকে যাচ্ছেন',
    noLocation: 'অবস্থান পাওয়া যায়নি',
    installPrompt: 'দ্রুত ও অফলাইন প্রবেশাধিকারের জন্য Guardian হোম স্ক্রিনে যোগ করুন।',
    install: 'ইনস্টল করুন', dismiss: 'এখন না'
  }
};

function t(key, vars) {
  const dict = STRINGS[state.lang] || STRINGS.en;
  let str = dict[key] !== undefined ? dict[key] : (STRINGS.en[key] || key);
  if (vars) {
    Object.keys(vars).forEach((k) => {
      str = str.replace(new RegExp('{{' + k + '}}', 'g'), vars[k]);
    });
  }
  return str;
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
}

/* ============================================================
   1. db — IndexedDB
   Stores:
     contacts       { id (auto), name, phone }
     settings       { key, value }
     pendingAlerts  { id (auto), contactName, contactPhone, message, createdAt }
   ============================================================ */
const DB_NAME = 'guardianDB';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('contacts')) {
        db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('pendingAlerts')) {
        db.createObjectStore('pendingAlerts', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    const req = fn(os);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function dbGetAllContacts() { return idbRequest('contacts', 'readonly', (os) => os.getAll()); }
function dbAddContact(contact) { return idbRequest('contacts', 'readwrite', (os) => os.add(contact)); }
function dbDeleteContact(id) { return idbRequest('contacts', 'readwrite', (os) => os.delete(id)); }

function dbGetSetting(key, fallback) {
  return idbRequest('settings', 'readonly', (os) => os.get(key))
    .then((row) => (row ? row.value : fallback));
}
function dbSetSetting(key, value) {
  return idbRequest('settings', 'readwrite', (os) => os.put({ key, value }));
}

function dbGetPendingAlerts() { return idbRequest('pendingAlerts', 'readonly', (os) => os.getAll()); }
function dbAddPendingAlert(alert) { return idbRequest('pendingAlerts', 'readwrite', (os) => os.add(alert)); }
function dbDeletePendingAlert(id) { return idbRequest('pendingAlerts', 'readwrite', (os) => os.delete(id)); }

/* ============================================================
   2. state — shared in-memory app state
   ============================================================ */
const state = {
  lang: 'en',
  contacts: [],
  settings: { callerName: '', callerNumber: '', supabaseUrl: '', supabaseKey: '' },
  walk: {
    active: false,
    endTime: null,
    minutes: 15,
    destination: '',
    triggered: false
  },
  share: {
    active: false,
    id: null,
    expiresAt: null,
    channel: null,
    supabase: null
  }
};

/* ============================================================
   3. geolocation — battery-conscious throttled tracker
   ------------------------------------------------------------
   navigator.geolocation.watchPosition() does not let you ask
   the OS for fixes "every N seconds based on my battery" — the
   browser/GPS chip decides fix frequency on its own, and can
   call our callback far more often than we actually need
   during a multi-hour Safe Walk. Polling the UI, or a live-share
   broadcast, on every single fix would keep the radio/CPU busy
   and drain the battery exactly when the person most needs it
   to last.

   So instead we let watchPosition run continuously (cheap: the
   callback itself does almost no work), and gate everything
   downstream — UI updates, storage, network broadcasts — behind
   a throttle interval that we recompute after every fix based
   on:
     (a) how fast the person seems to be moving (derived from
         the GPS-reported speed if available, otherwise from the
         distance and time between the last two fixes), and
     (b) remaining battery level, via the Battery Status API
         where the browser supports it (mainly Chromium/Android;
         Safari and Firefox do not implement it, in which case
         we simply treat battery level as "unknown" and skip
         that adjustment rather than fail).
   ============================================================ */
const GeoTracker = (() => {
  let watchId = null;
  let lastProcessedAt = 0;
  let lastFix = null; // { lat, lng, t }
  let batteryRef = null;
  let onUpdate = null;
  let onError = null;

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Decide how often we're willing to ACT on a new fix. Returns ms.
  function computeIntervalMs(speedMs, batteryLevel, isCharging) {
    let base;
    if (speedMs === null) {
      base = 8000; // unknown motion: moderate default
    } else if (speedMs < 0.3) {
      base = 20000; // effectively stationary — no need to sample often
    } else if (speedMs <= 2.5) {
      base = 5000; // normal walking pace — this is the core use case, keep it fresh
    } else {
      base = 8000; // faster than walking (e.g. in a vehicle) — back off a little
    }

    // Battery-conscious back-off. Only applies when NOT charging and the
    // Battery Status API is available; otherwise we leave `base` as-is
    // rather than guess.
    if (batteryLevel !== null && !isCharging) {
      if (batteryLevel <= 0.15) base *= 3;      // critical battery: sample much less
      else if (batteryLevel <= 0.30) base *= 1.7; // low battery: moderate back-off
    }

    // Safety ceiling: no matter how aggressively we back off for battery,
    // never go longer than 30s between processed fixes during an active
    // walk — staleness has its own safety cost.
    return Math.min(base, 30000);
  }

  function handlePosition(pos) {
    const now = Date.now();
    const { latitude, longitude, speed, accuracy } = pos.coords;

    let speedMs = (typeof speed === 'number' && !Number.isNaN(speed)) ? speed : null;
    if (speedMs === null && lastFix) {
      const dtSec = (now - lastFix.t) / 1000;
      if (dtSec > 0.5) {
        const dist = haversineMeters(lastFix.lat, lastFix.lng, latitude, longitude);
        speedMs = dist / dtSec;
      }
    }

    const batteryLevel = batteryRef ? batteryRef.level : null;
    const isCharging = batteryRef ? batteryRef.charging : true;
    const intervalMs = computeIntervalMs(speedMs, batteryLevel, isCharging);

    lastFix = { lat: latitude, lng: longitude, t: now };

    // --- THE ACTUAL THROTTLE ---
    // watchPosition can call us many times a minute; we only forward a
    // fix to the rest of the app at most once per `intervalMs`. This is
    // the single point that keeps a long Safe Walk from draining the
    // battery: cheap fixes keep arriving from the GPS chip, we just
    // ignore most of them on purpose.
    if (now - lastProcessedAt < intervalMs) return;
    lastProcessedAt = now;

    if (onUpdate) {
      onUpdate({ lat: latitude, lng: longitude, accuracy, t: now, speedMs, intervalMs });
    }
  }

  function handleError(err) {
    if (onError) onError(err);
  }

  async function start(updateCb, errorCb) {
    onUpdate = updateCb;
    onError = errorCb || null;
    if (!('geolocation' in navigator)) {
      if (onError) onError(new Error('geolocation-unsupported'));
      return false;
    }

    // Battery Status API: Chromium/Android only. Feature-detect and
    // degrade silently everywhere else (notably Safari/iOS, Firefox).
    if (navigator.getBattery) {
      try {
        batteryRef = await navigator.getBattery();
      } catch (e) {
        batteryRef = null;
      }
    } else {
      batteryRef = null;
    }

    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000
    });
    return true;
  }

  function stop() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    lastProcessedAt = 0;
    onUpdate = null;
    onError = null;
    // Deliberately keep `lastFix` after stop() so a caller can still read
    // the last known position (e.g. to build an alert) after the walk
    // ends or the watch is torn down.
  }

  function getLastFix() { return lastFix; }

  return { start, stop, getLastFix };
})();

function mapsLink(fix) {
  if (!fix) return t('noLocation');
  return 'https://maps.google.com/?q=' + fix.lat.toFixed(6) + ',' + fix.lng.toFixed(6);
}

/* ============================================================
   4. safe-walk-timer
   ------------------------------------------------------------
   Reliability note: a plain web page's JS timers are throttled
   or fully suspended by the OS/browser once the screen locks or
   the tab is backgrounded for a while — there is no background-
   execution guarantee for a client-only PWA without push
   notifications from a server. We do the best a client-only app
   can do: persist the walk's end time to localStorage (survives
   a reload/crash) and re-check it immediately whenever the page
   regains visibility, in addition to a live 1s countdown while
   the app is open. For a real-world deployment, pairing this
   with a server that can send a push notification at the
   expected arrival time would make the missed-check-in alert
   reliable even if the phone is asleep — that's out of scope for
   a backend-less client app, so we call it out here rather than
   overstate what this build guarantees.
   ============================================================ */
let walkTickInterval = null;

function persistWalk() {
  if (state.walk.active) {
    localStorage.setItem('guardian_walk', JSON.stringify({
      endTime: state.walk.endTime,
      destination: state.walk.destination,
      triggered: state.walk.triggered
    }));
  } else {
    localStorage.removeItem('guardian_walk');
  }
}

function restoreWalkIfActive() {
  const raw = localStorage.getItem('guardian_walk');
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    state.walk.active = true;
    state.walk.endTime = saved.endTime;
    state.walk.destination = saved.destination || '';
    state.walk.triggered = !!saved.triggered;
    document.getElementById('walk-destination').value = state.walk.destination;
    GeoTracker.start(handleWalkGeoUpdate, handleWalkGeoError);
    showWalkPanel(state.walk.triggered ? 'triggered' : 'active');
    startWalkTick();
  } catch (e) { /* ignore corrupt state */ }
}

function showWalkPanel(which) {
  document.getElementById('walk-setup').classList.toggle('hidden', which !== 'setup');
  document.getElementById('walk-active').classList.toggle('hidden', which !== 'active');
  document.getElementById('walk-triggered').classList.toggle('hidden', which !== 'triggered');
}

function startWalk() {
  if (state.contacts.length === 0) {
    alert(t('walkNoContactsHint'));
    navigateTo('contacts');
    return;
  }
  const mins = parseInt(document.getElementById('walk-minutes-val').textContent, 10) || 15;
  state.walk.active = true;
  state.walk.minutes = mins;
  state.walk.destination = document.getElementById('walk-destination').value.trim();
  state.walk.endTime = Date.now() + mins * 60000;
  state.walk.triggered = false;
  persistWalk();

  GeoTracker.start(handleWalkGeoUpdate, handleWalkGeoError);
  showWalkPanel('active');
  startWalkTick();
  updateHomePreviews();
}

function handleWalkGeoUpdate(fix) {
  document.getElementById('walk-gps-status').textContent = t('gpsActive');
  // If live sharing happens to be active at the same time, forward this
  // same throttled fix to it rather than opening a second GPS watch.
  if (state.share.active) broadcastShareFix(fix);
}

function handleWalkGeoError(err) {
  document.getElementById('walk-gps-status').textContent = t('gpsDenied');
}

function startWalkTick() {
  clearInterval(walkTickInterval);
  tickWalk();
  walkTickInterval = setInterval(tickWalk, 1000);
}

function tickWalk() {
  if (!state.walk.active || state.walk.triggered) {
    clearInterval(walkTickInterval);
    return;
  }
  const remainingMs = state.walk.endTime - Date.now();
  document.getElementById('walk-eta-time').textContent = formatClock(new Date(state.walk.endTime));

  if (remainingMs <= 0) {
    triggerMissedCheckin();
    return;
  }
  document.getElementById('walk-countdown').textContent = formatCountdown(remainingMs);
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function formatClock(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function markArrivedSafe() {
  state.walk.active = false;
  state.walk.triggered = false;
  clearInterval(walkTickInterval);
  GeoTracker.stop();
  persistWalk();
  showWalkPanel('setup');
  updateHomePreviews();
}

function cancelWalk() {
  markArrivedSafe();
}

function addTenMinutes() {
  state.walk.endTime += 10 * 60000;
  persistWalk();
}

function triggerMissedCheckin() {
  state.walk.triggered = true;
  clearInterval(walkTickInterval);
  persistWalk();
  showWalkPanel('triggered');

  const fix = GeoTracker.getLastFix();
  const destSuffix = state.walk.destination ? t('destSuffix', { dest: state.walk.destination }) : '';
  const message = t('smsMissedCheckin', {
    name: 'Guardian', // kept generic: the person's own name isn't collected by this app
    time: formatClock(new Date(state.walk.endTime)),
    dest: destSuffix,
    map: mapsLink(fix)
  });

  dispatchAlertToAllContacts(message);
  GeoTracker.stop();
  updateHomePreviews();
}

/* ============================================================
   5. silent-sos
   ------------------------------------------------------------
   DISCREET TRIGGER DESIGN NOTES — read before changing this.

   The brief asks for a "volume-button pattern" trigger. Being
   accurate about what's actually possible: standard mobile
   browsers do NOT expose physical volume-button presses to page
   JavaScript. The OS intercepts those buttons for system volume
   control before a web page (or even most native apps) ever
   sees the event, and there is no public Web API for it. Any
   demo claiming otherwise on a normal phone browser is not
   telling the truth. We still implement a keyboard listener
   below for the (real, if narrower) case of a physical/Bluetooth
   keyboard or a laptop's media keys, since that genuinely does
   fire key events in a browser — but treat it as a secondary,
   desktop-oriented trigger.

   The PRIMARY, fully reliable discreet trigger on a phone is a
   touch gesture on an innocuous element: a long-press (~2.5s) OR
   a fast 5-tap pattern on the small dot in the header, which is
   styled to look like an inert status mark, not a button. Both
   gestures are:
     - deliberate enough that a phone bumping around in a pocket
       won't fire them by accident,
     - fast enough to do through fabric or without looking,
     - and give a very quiet progress indicator (a thin bar) so
       the person can feel/see it working without anything on
       screen that would be visible to someone standing over
       their shoulder.
   ============================================================ */
const SOS_HOLD_MS = 2500;
const SOS_TAP_COUNT = 5;
const SOS_TAP_WINDOW_MS = 3000;

let sosHoldTimer = null;
let sosHoldStart = 0;
let sosHoldRAF = null;
let sosTapTimes = [];

function setupDiscreetTrigger() {
  const el = document.getElementById('discreet-trigger');
  const holdIndicator = document.getElementById('sos-hold-indicator');
  const holdFill = document.getElementById('sos-hold-fill');

  function beginHold() {
    sosHoldStart = Date.now();
    holdIndicator.classList.remove('hidden');
    const step = () => {
      const elapsed = Date.now() - sosHoldStart;
      const pct = Math.min(100, (elapsed / SOS_HOLD_MS) * 100);
      holdFill.style.width = pct + '%';
      if (elapsed >= SOS_HOLD_MS) {
        cancelHold(false);
        fireSilentSOS('hold');
        return;
      }
      sosHoldRAF = requestAnimationFrame(step);
    };
    sosHoldRAF = requestAnimationFrame(step);
  }

  function cancelHold(userReleased) {
    if (sosHoldRAF) cancelAnimationFrame(sosHoldRAF);
    sosHoldRAF = null;
    holdIndicator.classList.add('hidden');
    holdFill.style.width = '0%';
  }

  // Pointer events cover touch + mouse in one listener (works for both
  // a phone screen and a trackpad/desktop testing environment).
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    beginHold();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
    el.addEventListener(evt, () => cancelHold(true));
  });

  // Secondary gesture: 5 quick taps. Independent of the hold logic so a
  // person can use whichever is easier to do discreetly in the moment.
  el.addEventListener('click', () => {
    const now = Date.now();
    sosTapTimes.push(now);
    sosTapTimes = sosTapTimes.filter((ts) => now - ts <= SOS_TAP_WINDOW_MS);
    if (sosTapTimes.length >= SOS_TAP_COUNT) {
      sosTapTimes = [];
      fireSilentSOS('tap-pattern');
    }
  });

  setupDesktopKeyTrigger();
}

// Secondary trigger for physical/Bluetooth keyboards and laptop media
// keys. NOT relied upon as the primary mobile trigger — see notes above.
// Pattern: Volume-Down, Volume-Down, Volume-Up within 2s. Chosen because
// it's an unusual sequence unlikely to happen by accident while someone
// is just adjusting playback volume normally.
function setupDesktopKeyTrigger() {
  const PATTERN = ['AudioVolumeDown', 'AudioVolumeDown', 'AudioVolumeUp'];
  const WINDOW_MS = 2000;
  let buffer = [];
  let lastKeyAt = 0;

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'AudioVolumeDown' && e.code !== 'AudioVolumeUp') return;
    const now = Date.now();
    if (now - lastKeyAt > WINDOW_MS) buffer = [];
    lastKeyAt = now;
    buffer.push(e.code);
    if (buffer.length > PATTERN.length) buffer.shift();
    if (buffer.length === PATTERN.length && buffer.every((c, i) => c === PATTERN[i])) {
      buffer = [];
      fireSilentSOS('key-pattern');
    }
  });
}

function showSosToast(text, autoHideMs) {
  const toast = document.getElementById('sos-toast');
  document.getElementById('sos-toast-text').textContent = text;
  toast.classList.remove('hidden');
  if (autoHideMs) setTimeout(() => toast.classList.add('hidden'), autoHideMs);
}

async function fireSilentSOS(source) {
  // Deliberately no visible screen change beyond the small toast below —
  // no modal, no navigation, nothing a glance across a room would catch.
  showSosToast(t('sosToastSending'));

  // One-off high-accuracy fix rather than waiting on the throttled
  // walk-tracker (which may not even be running) — this needs to be as
  // fast as possible.
  let fix = GeoTracker.getLastFix();
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 });
    });
    fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
  } catch (e) { /* fall back to last known fix, or "location unavailable" */ }

  const message = t('smsSilentSos', { name: 'Guardian', map: mapsLink(fix) });

  // See dispatchAlertToAllContacts(): this opens the SMS composer for
  // the first contact immediately (allowed because this call chain
  // started from a real user gesture), and silently queues the rest as
  // pending alerts plus a silent network broadcast if configured —
  // rather than machine-gunning several SMS app hand-offs in a row.
  await dispatchAlertToAllContacts(message, { primaryOnly: false, silent: true });

  showSosToast(t('sosToastSent'), 2500);
}

/* Shared alert dispatch used by Safe Walk, Silent SOS, and Test Alert.
   Realistic behavior, honestly documented:
     - Contact #1 gets an SMS composer opened immediately, pre-filled.
       The person still has to tap Send in their own Messaging app —
       no web page can do that final tap for them.
     - Remaining contacts are queued as "pending alerts" (IndexedDB) and
       shown under Contacts with a one-tap "Send" button each, since
       reliably auto-opening several sms: composers back-to-back is not
       something browsers guarantee.
     - If a Supabase backend is configured, this ALSO pushes a genuinely
       silent network alert row (no SMS app, no screen change at all) —
       real automatic delivery, but only reaches a contact who has the
       corresponding "watch" page open, so it's a supplement, not a
       replacement for the SMS path. */
async function dispatchAlertToAllContacts(message, opts) {
  const contacts = state.contacts;
  if (contacts.length === 0) return;

  openSmsComposer(contacts[0].phone, message);

  for (let i = 1; i < contacts.length; i++) {
    await dbAddPendingAlert({
      contactName: contacts[i].name,
      contactPhone: contacts[i].phone,
      message,
      createdAt: Date.now()
    });
  }
  await renderPendingAlerts();

  if (state.settings.supabaseUrl && state.settings.supabaseKey) {
    silentNetworkAlert(message).catch(() => {});
  }
}

function openSmsComposer(phone, body) {
  // A synthetic <a href="sms:..."> click navigates the current
  // document to the sms: URL scheme, which hands off to the native
  // Messaging app without discarding this page's JS state (the same
  // way tel: links behave) — more reliable across mobile browsers than
  // window.open(), which some browsers popup-block outside a direct
  // click handler.
  const a = document.createElement('a');
  a.href = 'sms:' + encodeURIComponent(phone) + '?body=' + encodeURIComponent(body);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function silentNetworkAlert(message) {
  if (!state.share.supabase) await ensureSupabaseClient();
  if (!state.share.supabase) return;
  const channel = state.share.supabase.channel('guardian_sos_broadcast');
  await channel.subscribe();
  channel.send({ type: 'broadcast', event: 'sos', payload: { message, t: Date.now() } });
}

async function renderPendingAlerts() {
  const list = await dbGetPendingAlerts();
  const container = document.getElementById('pending-alerts');
  container.innerHTML = '';
  if (list.length === 0) return;

  const heading = document.createElement('p');
  heading.className = 'field-hint';
  heading.textContent = t('pendingAlertsLabel');
  container.appendChild(heading);

  list.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'contact-row';
    row.innerHTML =
      '<div><div class="contact-name"></div><div class="contact-phone"></div></div>' +
      '<button class="btn btn-secondary" style="width:auto;margin:0;" data-send-pending="' + item.id + '"></button>';
    row.querySelector('.contact-name').textContent = item.contactName;
    row.querySelector('.contact-phone').textContent = item.contactPhone;
    row.querySelector('[data-send-pending]').textContent = t('sendTo', { name: item.contactName });
    container.appendChild(row);
  });

  container.querySelectorAll('[data-send-pending]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.getAttribute('data-send-pending'), 10);
      const item = list.find((x) => x.id === id);
      if (!item) return;
      openSmsComposer(item.contactPhone, item.message);
      await dbDeletePendingAlert(id);
      renderPendingAlerts();
    });
  });
}

/* ============================================================
   6. fake-call
   ------------------------------------------------------------
   Ringtone is synthesized with the Web Audio API (two sine
   oscillators, classic dual-tone ring) rather than an audio
   file, so the feature works with zero network access and zero
   bundled media. Fully offline by construction.
   ============================================================ */
let fcAudioCtx = null;
let fcRingActive = false;
let fcRingTimeout = null;
let fcElapsedInterval = null;
let fcElapsedSec = 0;

function fcPlayTone(ctx, freqs, startAt, duration) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.05);
  gain.gain.setValueAtTime(0.25, startAt + duration - 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  gain.connect(ctx.destination);
  freqs.forEach((f) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(startAt);
    osc.stop(startAt + duration);
  });
}

function fcScheduleRing() {
  if (!fcRingActive || !fcAudioCtx) return;
  const now = fcAudioCtx.currentTime;
  // Classic dual-frequency ring cadence: ~1.2s ring, ~3s silence.
  fcPlayTone(fcAudioCtx, [440, 480], now + 0.02, 1.2);
  if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
  fcRingTimeout = setTimeout(fcScheduleRing, 4200);
}

function startRingtone() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // Web Audio unsupported: call UI still works, just silent
  fcAudioCtx = new AC();
  fcRingActive = true;
  fcScheduleRing();
}

function stopRingtone() {
  fcRingActive = false;
  clearTimeout(fcRingTimeout);
  if (fcAudioCtx) {
    fcAudioCtx.close().catch(() => {});
    fcAudioCtx = null;
  }
}

function triggerFakeCall() {
  const name = state.settings.callerName || t('defaultCallerName');
  const number = state.settings.callerNumber || t('defaultCallerNumber');
  document.getElementById('fc-name').textContent = name;
  document.getElementById('fc-number').textContent = number;
  document.getElementById('fc-avatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
  document.getElementById('fc-name-2').textContent = name;
  document.getElementById('fc-avatar-2').textContent = name.trim().charAt(0).toUpperCase() || '?';

  document.getElementById('fakecall-incoming').classList.remove('hidden');
  startRingtone();
}

function declineFakeCall() {
  stopRingtone();
  if (navigator.vibrate) navigator.vibrate(0);
  document.getElementById('fakecall-incoming').classList.add('hidden');
}

function answerFakeCall() {
  stopRingtone();
  if (navigator.vibrate) navigator.vibrate(0);
  document.getElementById('fakecall-incoming').classList.add('hidden');
  document.getElementById('fakecall-active').classList.remove('hidden');
  fcElapsedSec = 0;
  document.getElementById('fc-active-timer').textContent = '00:00';
  fcElapsedInterval = setInterval(() => {
    fcElapsedSec++;
    const m = String(Math.floor(fcElapsedSec / 60)).padStart(2, '0');
    const s = String(fcElapsedSec % 60).padStart(2, '0');
    document.getElementById('fc-active-timer').textContent = m + ':' + s;
  }, 1000);
}

function endFakeCall() {
  clearInterval(fcElapsedInterval);
  document.getElementById('fakecall-active').classList.add('hidden');
}

function setupFakeCallHandlers() {
  document.getElementById('fc-decline-btn').addEventListener('click', declineFakeCall);
  document.getElementById('fc-answer-btn').addEventListener('click', answerFakeCall);
  document.getElementById('fc-end-btn').addEventListener('click', endFakeCall);
}

/* ============================================================
   7. live-share
   ------------------------------------------------------------
   Uses Supabase Realtime broadcast as the lightweight backend
   for live pin updates. The Supabase JS client and Leaflet (for
   the read-only viewer's map) are loaded from a CDN on demand —
   only when Live Share is actually opened — so the rest of the
   app stays fully offline-capable and the service worker never
   has to cache map tiles or a mapping library it may not need.

   Sharing a Supabase anon key inside the share link is
   intentional, not an oversight: Supabase anon keys are
   designed to be exposed on the client (Row Level Security is
   what actually protects data, not keeping the anon key
   secret). A service-role key must NEVER be used here — this
   app only ever asks for the anon key.

   Expected Supabase-side setup (documented for whoever
   configures this in Settings): just enable Realtime on the
   project; no table is required since this uses ephemeral
   broadcast-only channels, not persisted rows.
   ============================================================ */
let supabaseScriptPromise = null;
function loadSupabaseScript() {
  if (window.supabase) return Promise.resolve();
  if (supabaseScriptPromise) return supabaseScriptPromise;
  supabaseScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@supabase/supabase-js@2';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return supabaseScriptPromise;
}

async function ensureSupabaseClient() {
  if (!state.settings.supabaseUrl || !state.settings.supabaseKey) return null;
  if (state.share.supabase) return state.share.supabase;
  try {
    await loadSupabaseScript();
    state.share.supabase = window.supabase.createClient(state.settings.supabaseUrl, state.settings.supabaseKey);
    return state.share.supabase;
  } catch (e) {
    return null;
  }
}

function broadcastShareFix(fix) {
  if (!state.share.active || !state.share.channel) return;
  state.share.channel.send({
    type: 'broadcast',
    event: 'loc',
    payload: { lat: fix.lat, lng: fix.lng, t: fix.t }
  });
}

async function startShare() {
  const minutes = parseInt(document.getElementById('share-minutes-val').textContent, 10) || 30;
  const client = await ensureSupabaseClient();
  const hint = document.getElementById('share-config-hint');
  if (!client) {
    hint.textContent = t('shareNoBackend');
    return;
  }
  hint.textContent = '';

  const shareId = (crypto.randomUUID ? crypto.randomUUID() : 'share-' + Date.now());
  const expiresAt = Date.now() + minutes * 60000;

  state.share.active = true;
  state.share.id = shareId;
  state.share.expiresAt = expiresAt;
  state.share.channel = client.channel('guardian_share_' + shareId);
  await state.share.channel.subscribe();

  // Only start a fresh GPS watch if the safe-walk timer isn't already
  // running one — no need for two concurrent watchPosition subscriptions.
  if (!state.walk.active) {
    GeoTracker.start(broadcastShareFix, () => {});
  }

  const link = location.origin + location.pathname +
    '?share=' + encodeURIComponent(shareId) +
    '&u=' + encodeURIComponent(state.settings.supabaseUrl) +
    '&k=' + encodeURIComponent(state.settings.supabaseKey) +
    '&exp=' + expiresAt;

  document.getElementById('share-link-input').value = link;
  document.getElementById('share-expires-time').textContent = formatClock(new Date(expiresAt));
  document.getElementById('share-setup').classList.add('hidden');
  document.getElementById('share-active').classList.remove('hidden');

  setTimeout(() => { if (state.share.id === shareId) stopShare(); }, expiresAt - Date.now());
}

function stopShare() {
  if (state.share.channel) state.share.channel.unsubscribe();
  state.share.active = false;
  state.share.channel = null;
  state.share.id = null;
  if (!state.walk.active) GeoTracker.stop();
  document.getElementById('share-setup').classList.remove('hidden');
  document.getElementById('share-active').classList.add('hidden');
}

function setupShareHandlers() {
  document.querySelectorAll('[data-share-mins]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('share-minutes-val');
      const next = Math.max(15, parseInt(el.textContent, 10) + parseInt(btn.getAttribute('data-share-mins'), 10));
      el.textContent = next;
    });
  });
  document.getElementById('share-start-btn').addEventListener('click', startShare);
  document.getElementById('share-stop-btn').addEventListener('click', stopShare);
  document.getElementById('share-copy-btn').addEventListener('click', () => {
    const input = document.getElementById('share-link-input');
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
  });
}

// Read-only viewer mode: index.html?share=ID&u=...&k=...&exp=...
async function checkViewerMode() {
  const params = new URLSearchParams(location.search);
  const shareId = params.get('share');
  if (!shareId) return;

  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById('screen-viewer').classList.add('active');
  document.querySelector('.bottom-nav')?.classList.add('hidden');

  const url = params.get('u');
  const key = params.get('k');
  const exp = parseInt(params.get('exp'), 10);
  const statusEl = document.getElementById('viewer-status');

  if (Date.now() > exp) {
    statusEl.textContent = t('viewerExpired');
    return;
  }
  if (!url || !key) {
    statusEl.textContent = t('viewerExpired');
    return;
  }

  statusEl.textContent = t('viewerConnecting');
  await loadSupabaseScript();
  await loadLeaflet();

  const client = window.supabase.createClient(url, key);
  const map = L.map('viewer-map').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const marker = L.marker([0, 0]).addTo(map);
  let firstFix = true;

  statusEl.textContent = t('viewerWaiting');

  const channel = client.channel('guardian_share_' + shareId);
  channel.on('broadcast', { event: 'loc' }, (msg) => {
    const { lat, lng, t: ts } = msg.payload;
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], firstFix ? 16 : map.getZoom());
    firstFix = false;
    statusEl.textContent = t('viewerUpdated', { time: formatClock(new Date(ts)) });
  });
  channel.subscribe();

  setTimeout(() => {
    channel.unsubscribe();
    statusEl.textContent = t('viewerExpired');
  }, Math.max(0, exp - Date.now()));
}

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletPromise;
}

/* ============================================================
   8. contacts
   ============================================================ */
async function refreshContacts() {
  state.contacts = await dbGetAllContacts();
  renderContactsList();
  updateHomePreviews();
}

function renderContactsList() {
  const listEl = document.getElementById('contacts-list');
  listEl.innerHTML = '';
  state.contacts.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'contact-row';
    li.innerHTML =
      '<div><div class="contact-name"></div><div class="contact-phone"></div></div>' +
      '<button class="contact-remove" data-remove="' + c.id + '"></button>';
    li.querySelector('.contact-name').textContent = c.name;
    li.querySelector('.contact-phone').textContent = c.phone;
    li.querySelector('.contact-remove').textContent = t('contactRemove');
    listEl.appendChild(li);
  });
  listEl.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await dbDeleteContact(parseInt(btn.getAttribute('data-remove'), 10));
      refreshContacts();
    });
  });
}

function setupContactsHandlers() {
  document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    if (!name || !phone) return;
    await dbAddContact({ name, phone });
    document.getElementById('contact-form').reset();
    refreshContacts();
  });

  document.getElementById('test-alert-btn').addEventListener('click', async () => {
    if (state.contacts.length === 0) {
      alert(t('walkNoContactsHint'));
      return;
    }
    let fix = GeoTracker.getLastFix();
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000 }));
      fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) { /* use last known fix or "unavailable" */ }
    const message = t('smsTest', { name: 'Guardian', map: mapsLink(fix) });
    dispatchAlertToAllContacts(message);
  });
}

/* ============================================================
   9. pwa — service worker + install prompt
   ============================================================ */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline-shell caching just won't be available this session;
    // the app still works online.
  });
}

function setupInstallPrompt() {
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = '<span></span><span style="display:flex;gap:8px;">' +
      '<button data-install></button><button data-dismiss style="background:none;color:var(--ink-soft);"></button></span>';
    banner.querySelector('span').textContent = t('installPrompt');
    banner.querySelector('[data-install]').textContent = t('install');
    banner.querySelector('[data-dismiss]').textContent = t('dismiss');
    banner.querySelector('[data-install]').addEventListener('click', async () => {
      banner.remove();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
      }
    });
    banner.querySelector('[data-dismiss]').addEventListener('click', () => banner.remove());
    document.body.appendChild(banner);
  });
}

/* ============================================================
   10. ui / navigation / init
   ============================================================ */
function navigateTo(screenName) {
  document.querySelectorAll('.screen').forEach((s) => {
    s.classList.toggle('active', s.getAttribute('data-screen') === screenName);
  });
  document.querySelectorAll('.bottom-nav-item').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-nav') === screenName);
  });
}

function updateHomePreviews() {
  const walkPreview = document.getElementById('walk-status-preview');
  if (state.walk.active) {
    walkPreview.textContent = t('navWalkSubActive', { time: formatClock(new Date(state.walk.endTime)) });
  } else {
    walkPreview.textContent = t('navWalkSub');
  }
  const contactsPreview = document.getElementById('contacts-count-preview');
  contactsPreview.textContent = state.contacts.length > 0
    ? t('navContactsSubCount', { count: state.contacts.length })
    : t('navContactsSub');
}

function renderHomeGreeting() {
  const now = new Date();
  document.getElementById('home-date').textContent = now.toLocaleDateString(
    state.lang === 'bn' ? 'bn-BD' : 'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' }
  );
  const hour = now.getHours();
  let key = 'greetingNight';
  if (hour >= 5 && hour < 12) key = 'greetingMorning';
  else if (hour >= 12 && hour < 17) key = 'greetingAfternoon';
  else if (hour >= 17 && hour < 21) key = 'greetingEvening';
  document.getElementById('home-greeting').textContent = t(key);
}

function setupNavigation() {
  document.body.addEventListener('click', (e) => {
    const target = e.target.closest('[data-nav]');
    if (!target) return;
    const dest = target.getAttribute('data-nav');
    if (dest === 'call') {
      triggerFakeCall();
      return;
    }
    navigateTo(dest);
  });
}

function setupWalkHandlers() {
  document.querySelectorAll('[data-mins]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.getElementById('walk-minutes-val');
      const next = Math.max(5, parseInt(el.textContent, 10) + parseInt(btn.getAttribute('data-mins'), 10));
      el.textContent = next;
    });
  });
  document.getElementById('walk-start-btn').addEventListener('click', startWalk);
  document.getElementById('walk-arrived-btn').addEventListener('click', markArrivedSafe);
  document.getElementById('walk-cancel-btn').addEventListener('click', cancelWalk);
  document.getElementById('walk-addtime-btn').addEventListener('click', addTenMinutes);
  document.getElementById('walk-triggered-ok-btn').addEventListener('click', () => {
    markArrivedSafe();
    navigateTo('home');
  });
}

function setupSettingsHandlers() {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.lang = btn.getAttribute('data-lang');
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b === btn));
      await dbSetSetting('lang', state.lang);
      applyI18n();
      renderHomeGreeting();
      renderContactsList();
      updateHomePreviews();
      renderPendingAlerts();
    });
  });

  document.getElementById('settings-save-btn').addEventListener('click', async () => {
    state.settings.callerName = document.getElementById('setting-caller-name').value.trim();
    state.settings.callerNumber = document.getElementById('setting-caller-number').value.trim();
    state.settings.supabaseUrl = document.getElementById('setting-supabase-url').value.trim();
    state.settings.supabaseKey = document.getElementById('setting-supabase-key').value.trim();
    state.share.supabase = null; // force re-init with new credentials next time it's needed

    await dbSetSetting('callerName', state.settings.callerName);
    await dbSetSetting('callerNumber', state.settings.callerNumber);
    await dbSetSetting('supabaseUrl', state.settings.supabaseUrl);
    await dbSetSetting('supabaseKey', state.settings.supabaseKey);

    const btn = document.getElementById('settings-save-btn');
    const original = btn.textContent;
    btn.textContent = t('saved');
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

async function initApp() {
  state.lang = await dbGetSetting('lang', (navigator.language || 'en').startsWith('bn') ? 'bn' : 'en');
  state.settings.callerName = await dbGetSetting('callerName', '');
  state.settings.callerNumber = await dbGetSetting('callerNumber', '');
  state.settings.supabaseUrl = await dbGetSetting('supabaseUrl', '');
  state.settings.supabaseKey = await dbGetSetting('supabaseKey', '');

  document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-lang') === state.lang));
  document.getElementById('setting-caller-name').value = state.settings.callerName;
  document.getElementById('setting-caller-number').value = state.settings.callerNumber;
  document.getElementById('setting-supabase-url').value = state.settings.supabaseUrl;
  document.getElementById('setting-supabase-key').value = state.settings.supabaseKey;

  applyI18n();
  renderHomeGreeting();

  state.contacts = await dbGetAllContacts();
  renderContactsList();
  updateHomePreviews();
  renderPendingAlerts();

  registerServiceWorker();
  setupInstallPrompt();
  setupDiscreetTrigger();
  setupNavigation();
  setupWalkHandlers();
  setupFakeCallHandlers();
  setupShareHandlers();
  setupContactsHandlers();
  setupSettingsHandlers();

  restoreWalkIfActive();

  // Re-check the walk deadline the instant the app regains focus, since
  // setInterval may have been throttled/suspended while backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.walk.active && !state.walk.triggered) {
      tickWalk();
    }
  });

  await checkViewerMode();
}

document.addEventListener('DOMContentLoaded', initApp);
