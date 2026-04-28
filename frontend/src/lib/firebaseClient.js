// Firebase client — initialised on demand (so simulator/MQTT/HTTP modes don't pay the cost).
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FB_API_KEY,
  authDomain: process.env.REACT_APP_FB_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FB_DATABASE_URL,
  projectId: process.env.REACT_APP_FB_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FB_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FB_APP_ID,
};

let _app = null, _auth = null, _db = null, _ready = null;

export function isFirebaseConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId);
}

export function getFirebase() {
  if (!isFirebaseConfigured()) return null;
  if (!_app) {
    _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _db = getDatabase(_app);
  }
  return { app: _app, auth: _auth, db: _db };
}

/**
 * Ensures a Firebase auth session is active before the first DB read/write.
 * Modes:
 *   - anonymous (default): signInAnonymously
 *   - custom: fetch a Firebase custom token from backend (/api/firebase/token,
 *             requires VaxChain JWT) and signInWithCustomToken
 *   - open: skip auth (DB rules must allow public)
 */
export function ensureAuth() {
  if (!_ready) {
    _ready = new Promise((resolve, reject) => {
      const fb = getFirebase();
      if (!fb) { reject(new Error('Firebase not configured')); return; }
      const mode = (process.env.REACT_APP_FB_AUTH_MODE || 'anonymous').toLowerCase();
      if (mode === 'open') { resolve(null); return; }
      const unsub = onAuthStateChanged(fb.auth, (user) => {
        if (user) { unsub(); resolve(user); }
      });
      if (mode === 'anonymous') {
        signInAnonymously(fb.auth).catch((e) => { unsub(); reject(e); });
      } else if (mode === 'custom') {
        axios.post(`${API}/firebase/token`)
          .then((r) => signInWithCustomToken(fb.auth, r.data.firebase_token))
          .catch((e) => { unsub(); reject(e); });
      }
    }).catch((err) => {
      _ready = null;
      throw err;
    });
  }
  return _ready;
}
