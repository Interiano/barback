import { useEffect, useState } from "react";
import { api } from "./auth";
import "./App.css";

type Item = { SK: string; name: string; on_hand: number; par: number };

function StockCard({ name, onHand, par }: { name: string; onHand: number; par: number }) {
  const have = Number(onHand);
  const need = Number(par);
  const low = have < need;
  const percent = Math.min(100, Math.round((have / need) * 100));

  return (
    <div className={low ? "card low" : "card"}>
      <h3>{name}</h3>
      <p className="count">
        {have} of {need} {low ? "· below par" : ""}
      </p>
      <div className="track">
        <div className="fill" style={{ width: percent + "%" }} />
      </div>
    </div>
  );
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/items")
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="page">
      <h1>Inventory</h1>
      {error && <p>Error: {error}</p>}
      <div className="grid">
        {items.map((i) => (
          <StockCard key={i.SK} name={i.name} onHand={i.on_hand} par={i.par} />
        ))}
      </div>
    </main>
  );
}

export default App;