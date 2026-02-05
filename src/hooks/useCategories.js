// src/hooks/useCategories.js

import { useEffect, useState, useCallback } from "react";
import { onSnapshot, query, orderBy } from "firebase/firestore";
import { CategoryService } from "../services/CategoryService";

export function useCategories(uid) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const add = useCallback(
    async (data) => {
      if (!uid) return;
      setError(null);
      try {
        await CategoryService.addCategory(uid, data);
      } catch (err) {
        console.error(err);
        setError(err);
      }
    },
    [uid]
  );

  const remove = useCallback(
    async (id) => {
      if (!uid) return;
      setError(null);
      try {
        await CategoryService.deleteCategory(uid, id);
      } catch (err) {
        console.error(err);
        setError(err);
      }
    },
    [uid]
  );

  useEffect(() => {
    if (!uid) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      CategoryService.getCollection(uid),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCategories(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  return {
    categories,
    loading,
    error,
    add,
    remove,
  };
}
