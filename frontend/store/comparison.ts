import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HistoryItem } from "@/lib/api/python-client";

interface ComparisonStore {
  items: HistoryItem[];
  add:    (item: HistoryItem) => void;
  remove: (id: number) => void;
  clear:  () => void;
}

export const useComparisonStore = create<ComparisonStore>()(
  persist(
    (set, get) => ({
      items: [],
      add(item) {
        if (get().items.length >= 4) return;           // max 4
        if (get().items.find((i) => i.id === item.id)) return; // no duplicates
        set((s) => ({ items: [...s.items, item] }));
      },
      remove(id) {
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
      },
      clear() {
        set({ items: [] });
      },
    }),
    { name: "comparison-store" }
  )
);
