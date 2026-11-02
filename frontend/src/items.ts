import { useEffect, useState } from "react";
import { api } from "./auth";

export type Item = { SK: string; name: string; category?: string; unit?: string; on_hand: number; par: number };

export function itemId(item: Item) {
  return item.SK.replace("ITEM#", "");
}

export function isLow(item: Item) {
  return Number(item.on_hand) < Number(item.par);
}

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/items")
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return { items, error, loading };
}