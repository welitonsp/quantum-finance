// src/App.jsx

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

import CategoryPieChart from "./components/CategoryPieChart";

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [transactions, setTransactions] = useState([]);

  const [value, setValue] = useState("");
  const [type, setType] = useState("entrada");
  const [category, setCategory] = useState("");

  // 🔐 Autenticação anônima
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setAuthReady(true);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsub();
  }, []);

  const uid = user?.uid;

  // ☁️ Firestore
  useEffect(() => {
    if (!authReady || !uid) return;

    const q = query(
      collection(db, "users", uid, "transactions"),
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
  }, [authReady, uid]);

  // ➕ Adicionar transação
  const addTransaction = async () => {
    if (!uid || !value) return;

    await addDoc(collection(db, "users", uid, "transactions"), {
      value: Number(value),
      type: type || "entrada",
      category: category || "Sem categoria",
      createdAt: serverTimestamp(),
    });

    setValue("");
    setCategory("");
    setType("entrada");
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-900 text-white">
        Autenticando no Firebase...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-zinc-800 rounded-xl p-6 space-y-6">
        <h1 className="text-2xl font-bold text-center">
          Quantum Finance ☁️
        </h1>

        {/* FORMULÁRIO */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            type="number"
            placeholder="Valor"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
          />

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>

          <input
            type="text"
            placeholder="Categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
          />

          <button
            onClick={addTransaction}
            className="bg-indigo-600 hover:bg-indigo-700 rounded px-4 py-2 font-semibold"
          >
            Salvar
          </button>
        </div>

        {/* LISTA */}
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {transactions.map((t) => (
            <li
              key={t.id}
              className="flex justify-between bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
            >
              <span>
                {t.category || "Sem categoria"} ({t.type || "entrada"})
              </span>
              <span className="font-semibold">
                R$ {t.value}
              </span>
            </li>
          ))}
        </ul>

        {/* GRÁFICO */}
        <CategoryPieChart transactions={transactions} />
      </div>
    </div>
  );
}
