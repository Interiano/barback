import { useEffect, useState } from "react";
import { api } from "./auth";

export const CATEGORIES = [
  "Vodka", "Gin", "Tequila", "Mezcal", "Rum", "Whiskey", "Brandy",
  "Liqueur", "Amaro & Aperitivo", "Vermouth & Wine", "Beer", "Syrup & Mixer", "Other",
];

export type Item = { SK: string; name: string; category?: string; unit?: string; on_hand: number; par: number };

export function itemId(item: Item) {
  return item.SK.replace("ITEM#", "");
}

export function isLow(item: Item) {
  return Number(item.on_hand) < Number(item.par);
}

export function categoryOf(item: Item) {
  return item.category && CATEGORIES.includes(item.category) ? item.category : "Uncategorized";
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
