// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

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

const auth = getAuth(app, {
    popupRedirectResolver: browserPopupRedirectResolver,
});

const db = getFirestore(app);

// Ativa a persistência offline. Isso permite que o app funcione offline
// e carrega dados do cache primeiro para uma experiência mais rápida.
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    // Múltiplas abas abertas podem causar isso.
    console.warn('Firebase persistence could not be enabled. Either multiple tabs are open or another issue occurred.');
  } else if (err.code == 'unimplemented') {
    // O navegador não suporta a funcionalidade.
     console.warn('The browser does not support Firebase offline persistence.');
  }
});


export { app, auth, db };
