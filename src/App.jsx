import { useEffect, useState } from "react";
import { auth, db } from "./firebase";

import {
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";

import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [value, setValue] = useState("");

  // 🔐 AUTH ANÔNIMA
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ☁️ FIRESTORE (LISTENER)
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "transactions"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setTransactions(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, [user]);

  // ➕ SALVAR DADO NO FIRESTORE
  const addTransaction = async () => {
    if (!value) return;

    await addDoc(
      collection(db, "users", user.uid, "transactions"),
      {
        value: Number(value),
        createdAt: serverTimestamp(),
      }
    );

    setValue("");
  };

  // ⏳ LOADING
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Conectando ao Firebase...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-8">
      <h1 className="text-2xl font-bold mb-4">
        Quantum Finance – Firebase OK ✅
      </h1>

      <div className="mb-6">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Valor"
          className="bg-black border border-zinc-700 p-2 rounded mr-2"
        />
        <button
          onClick={addTransaction}
          className="bg-indigo-600 px-4 py-2 rounded"
        >
          Salvar
        </button>
      </div>

      <ul className="space-y-2">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="bg-zinc-800 p-3 rounded"
          >
            Valor: {t.value}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
