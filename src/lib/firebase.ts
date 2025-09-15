// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth'; // ou initializeAuth se precisar customizar
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "studio-4977373253-2de1c",
  appId: "1:1083746480355:web:a582c53d3c9a3cfa1ad5d6",
  storageBucket: "studio-4977373253-2de1c.firebasestorage.app",
  apiKey: "AIzaSyDJJ7MyIXW0-g4lxpKmDPpF1ivqPA9mHR0",
  authDomain: "studio-4977373253-2de1c.firebaseapp.com",
  messagingSenderId: "1083746480355"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Auth (use initializeAuth se realmente precisar do browserPopupRedirectResolver)
const auth = getAuth(app);

// Firestore com cache persistente (IndexedDB)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({})
});

export { app, auth, db };