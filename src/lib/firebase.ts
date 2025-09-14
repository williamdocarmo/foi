// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, memoryLocalCache } from 'firebase/firestore';

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

// Inicializa o Firestore com o cache persistente (IndexedDB) para offline.
// Isso garante que os dados do usuário fiquem disponíveis mesmo se o app for aberto sem internet.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({})
});


export { app, auth, db };
