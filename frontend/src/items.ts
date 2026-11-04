import { useEffect, useState } from "react";
import { api } from "./auth";

export type Item = { SK: string; name: string; category?: string; unit?: string; on_hand: number; par: number };

export function itemId(item: Item) {
  return item.SK.replace("ITEM#", "");
}

export function isLow(item: Item) {
  return Number(item.on_hand) < Number(item.par);
}

export function categoryOf(item: Item, categories: string[]) {
  return item.category && categories.includes(item.category) ? item.category : "Uncategorized";
}

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api("/items")
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [version]);

  return { items, error, loading, reload: () => setVersion((v) => v + 1) };
}

export function useCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api("/categories")
      .then((r) => r.json())
      .then((d: { builtIn: string[]; custom: string[] }) => setCategories([...d.builtIn, ...d.custom]))
      .catch(() => setCategories([]));
  }, [version]);

  async function create(name: string) {
    const r = await api("/categories", { method: "POST", body: JSON.stringify({ name }) });
    if (r.status === 403) throw new Error("Only owners can create categories.");
    if (r.status === 409) throw new Error("That category already exists.");
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error ?? `Could not create category (${r.status})`);
    }
    setVersion((v) => v + 1);
  }

  return { categories, create };
}
