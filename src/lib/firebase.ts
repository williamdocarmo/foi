// src/lib/firebase.ts
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { siteConfig } from '@/config/site';

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

// Get Auth instance and explicitly set the authDomain
const auth = getAuth(app, {
    // This forces the popup to use your custom domain.
    // It's a more reliable way to ensure the correct domain is shown.
    popupRedirectResolver: browserPopupRedirectResolver,
});
auth.tenantId = null;
if (typeof window !== 'undefined' && window.location.hostname === new URL(siteConfig.url).hostname) {
    auth.config.authDomain = new URL(siteConfig.url).hostname;
}


const db = getFirestore(app);

export { app, auth, db };
