// src/firebase/auth.js

import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import app from "./index";

export const auth = getAuth(app);

export function initAuth(onUserChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      onUserChange(user);
    } else {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Erro ao autenticar anonimamente:", error);
      }
    }
  });
}
