// src/services/CategoryService.js

import {
  collection,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/index";

export class CategoryService {
  static getCollection(uid) {
    return collection(db, "users", uid, "categories");
  }

  static async addCategory(uid, data) {
    return await addDoc(this.getCollection(uid), {
      name: data.name,
      type: data.type, // "income" | "expense"
      createdAt: serverTimestamp(),
    });
  }

  static async deleteCategory(uid, id) {
    return await deleteDoc(
      collection(db, "users", uid, "categories"),
      id
    );
  }
}
