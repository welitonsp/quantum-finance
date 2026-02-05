// src/App.jsx

import { useEffect, useMemo, useState } from "react";
import { initAuth } from "./firebase/auth";
import { useTransactions } from "./hooks/useTransactions";
import { useCategories } from "./hooks/useCategories";
import CategoryPieChart from "./components/CategoryPieChart";

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Formulário transação
  const [value, setValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");

  // Formulário categoria
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState("expense");

  // 🔐 Auth
  useEffect(() => {
    const unsub = initAuth((u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 📦 Hooks
  const {
    transactions,
    loading: txLoading,
    add: addTransaction,
  } = useTransactions(user?.uid);

  const {
    categories,
    loading: catLoading,
    add: addCategory,
  } = useCategories(user?.uid);

  // ======================
  // 📊 DASHBOARD
  // ======================
  const dashboard = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byCategory = {};

    transactions.forEach((t) => {
      const val = Number(t.value) || 0;

      if (val >= 0) {
        income += val;
      } else {
        expense += Math.abs(val);
      }

      if (t.categoryName) {
        byCategory[t.categoryName] =
          (byCategory[t.categoryName] || 0) + Math.abs(val);
      }
    });

    return {
      income,
      expense,
      balance: income - expense,
      byCategory,
    };
  }, [transactions]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        Conectando ao Firebase...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 p-8 space-y-10">
      <h1 className="text-2xl font-bold">
        Quantum Finance — Dashboard 📊
      </h1>

      {/* CARDS */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-800 p-6 rounded">
          <div className="text-zinc-400 text-sm">Entradas</div>
          <div className="text-2xl font-bold text-emerald-400">
            R$ {dashboard.income.toFixed(2)}
          </div>
        </div>

        <div className="bg-zinc-800 p-6 rounded">
          <div className="text-zinc-400 text-sm">Saídas</div>
          <div className="text-2xl font-bold text-rose-400">
            R$ {dashboard.expense.toFixed(2)}
          </div>
        </div>

        <div className="bg-zinc-800 p-6 rounded">
          <div className="text-zinc-400 text-sm">Saldo</div>
          <div
            className={`text-2xl font-bold ${
              dashboard.balance >= 0
                ? "text-emerald-400"
                : "text-rose-400"
            }`}
          >
            R$ {dashboard.balance.toFixed(2)}
          </div>
        </div>
      </section>

      {/* GRÁFICO */}
      <section className="bg-zinc-800 p-6 rounded">
        <h2 className="font-bold mb-4">
          Distribuição por Categoria
        </h2>
        <CategoryPieChart data={dashboard.byCategory} />
      </section>

      {/* CATEGORIAS */}
      <section className="bg-zinc-800 p-6 rounded space-y-4">
        <h2 className="font-bold">Categorias</h2>

        <div className="flex gap-2">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Nome da categoria"
            className="bg-black border border-zinc-700 p-2 rounded flex-1"
          />
          <select
            value={categoryType}
            onChange={(e) => setCategoryType(e.target.value)}
            className="bg-black border border-zinc-700 p-2 rounded"
          >
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <button
            onClick={() => {
              if (!categoryName) return;
              addCategory({
                name: categoryName,
                type: categoryType,
              });
              setCategoryName("");
            }}
            className="bg-indigo-600 px-4 rounded"
          >
            Adicionar
          </button>
        </div>

        {catLoading && <div>Carregando categorias...</div>}
      </section>

      {/* TRANSAÇÕES */}
      <section className="bg-zinc-800 p-6 rounded space-y-4">
        <h2 className="font-bold">Transações</h2>

        <div className="flex gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Valor"
            className="bg-black border border-zinc-700 p-2 rounded flex-1"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-black border border-zinc-700 p-2 rounded"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              if (!value) return;

              const cat = categories.find(
                (c) => c.id === selectedCategory
              );

              const numericValue =
                cat?.type === "expense"
                  ? -Math.abs(Number(value))
                  : Math.abs(Number(value));

              addTransaction({
                value: numericValue,
                categoryId: cat?.id || null,
                categoryName: cat?.name || null,
              });

              setValue("");
              setSelectedCategory("");
            }}
            className="bg-emerald-600 px-4 rounded"
          >
            Salvar
          </button>
        </div>

        {txLoading && <div>Carregando transações...</div>}
      </section>
    </div>
  );
}
