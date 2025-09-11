// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "studio-4977373253-2de1c",
  appId: "1:1083746480355:web:a582c53d3c9a3cfa1ad5d6",
  storageBucket: "studio-4977373253-2de1c.firebasestorage.app",
  apiKey: "AIzaSyDJJ7MyIXW0-g4lxpKmDPpF1ivqPA9mHR0",
  authDomain: "app.foiumaideia.com",
  messagingSenderId: "1083746480355"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
