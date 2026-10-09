const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDocs, collection } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

const firebaseConfig = {
  apiKey: "AIzaSyDdVxQ8kLDxUbX8cEqaUkHIy0Bbtu2-TOs",
  authDomain: "anketor1.firebaseapp.com",
  projectId: "anketor1",
  storageBucket: "anketor1.firebasestorage.app",
  messagingSenderId: "480186637658",
  appId: "1:480186637658:web:102b3a7d67e31eb12fa763"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncLocalSurveysToFirebase() {
  console.log('🔄 Firebase Firestore senkronizasyonu başlatılıyor...');
  const surveysFile = path.join(__dirname, 'data', 'surveys.json');
  const surveys = JSON.parse(fs.readFileSync(surveysFile, 'utf-8'));

  for (const survey of surveys) {
    console.log(`📤 Yükleniyor: ${survey.title} (ID: ${survey.id})...`);
    await setDoc(doc(db, 'surveys', survey.id), survey, { merge: true });
  }

  console.log('✅ Tüm anketler Firestore veritabanına başarıyla yüklendi!');
}

syncLocalSurveysToFirebase().catch(err => {
  console.error('❌ Firebase Senkronizasyon Hatası:', err);
});
