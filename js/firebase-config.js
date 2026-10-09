// Firebase Web SDK Configuration & Services Initialization

const firebaseConfig = {
  apiKey: "AIzaSyDdVxQ8kLDxUbX8cEqaUkHIy0Bbtu2-TOs",
  authDomain: "anketor1.firebaseapp.com",
  projectId: "anketor1",
  storageBucket: "anketor1.firebasestorage.app",
  messagingSenderId: "480186637658",
  appId: "1:480186637658:web:102b3a7d67e31eb12fa763"
};

let firestoreDb = null;
let firebaseAuth = null;

try {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    if (firebase.firestore) {
      firestoreDb = firebase.firestore();
    }
    if (firebase.auth) {
      firebaseAuth = firebase.auth();
    }
    console.log('🔥 Firebase (Firestore & Auth) hazır! Proje: anketor1');
  }
} catch (err) {
  console.warn('Firebase başlatılırken uyarı:', err);
}
