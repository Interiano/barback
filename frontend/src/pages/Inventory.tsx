import { useState } from "react";
import { api } from "../auth";
import StockCard from "../StockCard";
import { CATEGORIES, categoryOf, itemId, useItems, type Item } from "../items";

function Inventory() {
  const { items, error, reload } = useItems();
  const [filter, setFilter] = useState("All");
  const [saveError, setSaveError] = useState("");

  const present = [...CATEGORIES, "Uncategorized"].filter((c) => items.some((i) => categoryOf(i) === c));
  const groups = present.filter((c) => filter === "All" || filter === c);

  async function changeCategory(item: Item, category: string) {
    setSaveError("");
    const r = await api(`/items/${itemId(item)}`, { method: "PUT", body: JSON.stringify({ category }) });
    if (r.status === 403) setSaveError("Only owners can change categories.");
    else if (!r.ok) setSaveError(`Save failed (${r.status})`);
    reload();
  }

  return (
    <>
      <h1>Inventory</h1>
      {error && <p>Error: {error}</p>}
      {saveError && <p className="error">{saveError}</p>}

      <div className="chips" role="group" aria-label="Filter by category">
        {["All", ...present].map((c) => (
          <button key={c} className={c === filter ? "chip active" : "chip"} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>

      {groups.map((c) => (
        <section key={c}>
          <h2 className="group-title">{c}</h2>
          <div className="grid">
            {items
              .filter((i) => categoryOf(i) === c)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((i) => (
                <StockCard key={i.SK} name={i.name} onHand={i.on_hand} par={i.par}>
                  <select
                    aria-label={`Category for ${i.name}`}
                    className="field category"
                    value={categoryOf(i) === "Uncategorized" ? "" : categoryOf(i)}
                    onChange={(e) => changeCategory(i, e.target.value)}
                  >
                    {categoryOf(i) === "Uncategorized" && <option value="">Choose category…</option>}
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </StockCard>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default Inventory;
