import { useState, useEffect, useCallback } from "react";
import { pythonClient, type HistoryItem } from "@/lib/api/python-client";

export function useHistory() {
  const [items,   setItems]   = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await pythonClient.getHistory();
      setItems(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteItem(id: number) {
    // Optimistic update — remove immediately for a snappy feel
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await pythonClient.deleteHistory(id);
    } catch (e: unknown) {
      // Server delete failed — roll back and surface the error
      setItems(snapshot);
      setError(e instanceof Error ? e.message : "Failed to delete record");
    }
  }

  return { items, loading, error, deleteItem, reload: load };
}
