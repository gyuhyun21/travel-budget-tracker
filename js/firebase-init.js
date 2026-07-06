import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCBkBMtc_1XhQQTkTl2gBeYVQCrk4rE49Q",
  authDomain: "budget-55765.firebaseapp.com",
  projectId: "budget-55765",
  storageBucket: "budget-55765.firebasestorage.app",
  messagingSenderId: "135843007318",
  appId: "1:135843007318:web:c8d87202c6b1fc874ae4f7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.fsDb = db;
window.fsDoc = doc;
window.fsGetDoc = getDoc;
window.fsSetDoc = setDoc;
window.fsUpdateDoc = updateDoc;
window.fsDeleteDoc = deleteDoc;
window.fsCollection = collection;
window.fsOnSnapshot = onSnapshot;
window.fsServerTimestamp = serverTimestamp;
window.dispatchEvent(new Event('firebase-ready'));
