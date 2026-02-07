// src/firebase/index.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBVgGOF8GOiNL27BWR-6ux3QfOXc4ELU-s",
  authDomain: "quantum-finance-39235.firebaseapp.com",
  projectId: "quantum-finance-39235",
  storageBucket: "quantum-finance-39235.firebasestorage.app",
  messagingSenderId: "493116032250",
  appId: "1:493116032250:web:0d4bbe2a42d81788637543",
};

// 🔥 Inicializa Firebase
const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);

// ☁️ Firestore
export const db = getFirestore(app);

// (opcional) export default se algum arquivo usar
export default app;
