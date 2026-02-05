// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 🔥 Configuração do Firebase (TODOS OS VALORES SÃO STRINGS)
const firebaseConfig = {
  apiKey: "AIzaSyBVgGOF8GOiNL27BWR-6ux3QfOXc4ELU-s",
  authDomain: "quantum-finance-39235.firebaseapp.com",
  projectId: "quantum-finance-39235",
  storageBucket: "quantum-finance-39235.firebasestorage.app",
  messagingSenderId: "493116032250",
  appId: "web:0d4bbe2a42d81788637543",
};

// 🚀 Inicializa o Firebase (uma única vez)
const app = initializeApp(firebaseConfig);

// 🔐 Auth
export const auth = getAuth(app);

// ☁️ Firestore
export const db = getFirestore(app);

// Export opcional
export default app;
