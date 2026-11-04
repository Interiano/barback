import { useState } from "react";
import { api } from "../auth";
import CategoryPicker from "../CategoryPicker";
import { categoryOf, isLow, useCategories, useItems, type Item } from "../items";

type Unit = "btl" | "case";
type Line = { name: string; qty: number; unit: Unit };
type Result = { sent: boolean; summary?: string; message?: string };

// Adding a product that is already on the sheet (same unit) sets its quantity, so nothing doubles up.
function setLine(lines: Line[], add: Line) {
  const match = lines.find((l) => l.name.toLowerCase() === add.name.toLowerCase() && l.unit === add.unit);
  if (match) {
    return lines.map((l) => (l === match ? { ...l, qty: add.qty } : l));
  }
  return [...lines, add];
}

function summary(lines: Line[]) {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const cases = lines.filter((l) => l.unit === "case").reduce((s, l) => s + l.qty, 0);
  const bottles = lines.filter((l) => l.unit === "btl").reduce((s, l) => s + l.qty, 0);
  const parts = [plural(lines.length, "product")];
  if (bottles) parts.push(plural(bottles, "bottle"));
  if (cases) parts.push(plural(cases, "case"));
  return parts.join(", ");
}

function shortfall(item: Item) {
  return Math.max(1, Math.ceil(Number(item.par) - Number(item.on_hand)));
}

function clampQty(value: string) {
  return Math.max(1, Math.min(999, Math.round(Number(value)) || 1));
}

function Orders() {
  const { items, error, loading, reload } = useItems();
  const { categories, create } = useCategories();
  const [cart, setCart] = useState<Line[] | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [rowQty, setRowQty] = useState<Record<string, number>>({});
  const [rowUnit, setRowUnit] = useState<Record<string, Unit>>({});
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState<Unit>("btl");
  const [formError, setFormError] = useState("");
  const [saveToInventory, setSaveToInventory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newPar, setNewPar] = useState(1);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sendError, setSendError] = useState("");

  const low = items
    .filter(isLow)
    .map((i) => ({ name: i.name, qty: shortfall(i), unit: "btl" as Unit }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = cart ?? low;
  const present = [...categories, "Uncategorized"].filter((c) => items.some((i) => categoryOf(i, categories) === c));
  const shown = items
    .filter((i) => filter === "All" || categoryOf(i, categories) === filter)
    .filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function update(next: Line[]) {
    setCart(next);
    setResult(null);
  }

  function addFromStock(item: Item) {
    const qty = rowQty[item.SK] ?? (isLow(item) ? shortfall(item) : 1);
    const unit = rowUnit[item.SK] ?? "btl";
    update(setLine(lines, { name: item.name, qty, unit }));
  }

  async function addCustom() {
    const name = newName.trim();
    if (!name) return setFormError("Enter a product name.");
    if (!Number.isInteger(newQty) || newQty < 1 || newQty > 999) return setFormError("Quantity must be 1 to 999.");
    const exists = items.some((i) => i.name.toLowerCase() === name.toLowerCase());
    if (saveToInventory && !exists) {
      if (!newCategory) return setFormError("Choose a category. Every inventory item needs one.");
      if (!Number.isInteger(newPar) || newPar < 1 || newPar > 999) return setFormError("Par must be 1 to 999.");
      setAdding(true);
      try {
        const r = await api("/items", {
          method: "POST",
          body: JSON.stringify({ name, category: newCategory, on_hand: 0, par: newPar }),
        });
        if (r.status === 403) return setFormError("Only owners can add to inventory.");
        if (!r.ok) return setFormError(`Could not save to inventory (${r.status})`);
        reload();
      } finally {
        setAdding(false);
      }
    }
    setFormError("");
    update(setLine(lines, { name, qty: newQty, unit: newUnit }));
    setNewName("");
    setNewQty(1);
    setSaveToInventory(false);
    setNewCategory("");
    setNewPar(1);
  }

  async function send() {
    setSending(true);
    setSendError("");
    setResult(null);
    try {
      const r = await api("/orders/send", { method: "POST", body: JSON.stringify({ lines }) });
      if (r.status === 403) throw new Error("Only owners can send orders.");
      if (!r.ok) throw new Error(`Send failed (${r.status})`);
      setResult(await r.json());
      setCart([]);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="muted">Loading your shelf…</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <>
      <h1>Par & Orders</h1>

      <div className="order-layout">
        <section className="panel">
          <h2>Below par</h2>
          {low.length === 0 ? (
            <p className="muted">Everything is at par.</p>
          ) : (
            <ul className="plain-list">
              {low.map((l) => (
                <li key={l.name}>
                  <span>
                    {l.name} <span className="muted">· order {l.qty} btl</span>
                  </span>
                  <button className="btn small" onClick={() => update(setLine(lines, l))}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>All stock</h2>
          <div className="stock-controls">
            <select aria-label="Filter by category" className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="All">All categories</option>
              {present.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              aria-label="Search inventory"
              className="field"
              placeholder="Search, e.g. gin"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="muted small-text">
            Showing {shown.length} of {items.length}
          </p>
          <div className="stock-list">
            {shown.map((i) => (
              <div key={i.SK} className={isLow(i) ? "stock-row low-row" : "stock-row"}>
                <div className="stock-name">
                  <span>{i.name}</span>
                  <span className="muted small-text">
                    {Number(i.on_hand)} / {Number(i.par)} · {categoryOf(i, categories)}
                  </span>
                </div>
                <input
                  aria-label={`Quantity to order for ${i.name}`}
                  className="field qty"
                  type="number"
                  min={1}
                  max={999}
                  value={rowQty[i.SK] ?? (isLow(i) ? shortfall(i) : 1)}
                  onChange={(e) => setRowQty({ ...rowQty, [i.SK]: clampQty(e.target.value) })}
                />
                <select
                  aria-label={`Unit for ${i.name}`}
                  className="field unit"
                  value={rowUnit[i.SK] ?? "btl"}
                  onChange={(e) => setRowUnit({ ...rowUnit, [i.SK]: e.target.value as Unit })}
                >
                  <option value="btl">btl</option>
                  <option value="case">case</option>
                </select>
                <button className="btn small" onClick={() => addFromStock(i)} aria-label={`Add ${i.name}`}>
                  Add
                </button>
              </div>
            ))}
            {shown.length === 0 && <p className="muted">No match. Add it below as a new line.</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Add any bottle</h2>
        <div className="add-row">
          <input
            aria-label="Product name"
            className="field"
            placeholder="Product, e.g. Tito's Vodka"
            list="product-names"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <datalist id="product-names">
            {items.map((i) => (
              <option key={i.SK} value={i.name} />
            ))}
          </datalist>
          <input
            aria-label="Quantity"
            className="field qty"
            type="number"
            min={1}
            max={999}
            value={newQty}
            onChange={(e) => setNewQty(clampQty(e.target.value))}
          />
          <select aria-label="Unit" className="field unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value as Unit)}>
            <option value="btl">btl</option>
            <option value="case">case</option>
          </select>
          <button className="btn" onClick={addCustom} disabled={adding}>
            {adding ? "Saving…" : "Add to order"}
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={saveToInventory} onChange={(e) => setSaveToInventory(e.target.checked)} />
          Also add to inventory (new product you'll keep stocking)
        </label>
        {saveToInventory && (
          <div className="add-row">
            <CategoryPicker
              label="Category"
              value={newCategory}
              categories={categories}
              onChange={setNewCategory}
              onCreate={create}
            />
            <label className="muted" htmlFor="new-par">Par</label>
            <input
              id="new-par"
              className="field qty"
              type="number"
              min={1}
              max={999}
              value={newPar}
              onChange={(e) => setNewPar(clampQty(e.target.value))}
            />
          </div>
        )}
        {formError && <p className="error">{formError}</p>}
      </section>

      <section className="panel">
        <h2>Order sheet</h2>
        <p className="muted">This is exactly what the email will show.</p>
        {lines.length === 0 ? (
          <p className="muted">No lines yet. Add bottles above.</p>
        ) : (
          <>
            <table className="sheet">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.name + l.unit}>
                    <td>{l.name}</td>
                    <td>
                      <input
                        aria-label={`Quantity for ${l.name}`}
                        className="field qty"
                        type="number"
                        min={1}
                        max={999}
                        value={l.qty}
                        onChange={(e) => update(lines.map((x) => (x === l ? { ...x, qty: clampQty(e.target.value) } : x)))}
                      />
                    </td>
                    <td>{l.unit}</td>
                    <td>
                      <button className="btn small" onClick={() => update(lines.filter((x) => x !== l))} aria-label={`Remove ${l.name}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="count-total">{summary(lines)}</p>
            <button className="btn primary" onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Send order"}
            </button>
          </>
        )}
        {sendError && <p className="error">Error: {sendError}</p>}
      </section>

      {result && (
        <div className="toast" role="status">
          <img src="/avatar.png" alt="" className="avatar small" />
          <p>{result.sent ? `Order sent. ${result.summary}.` : result.message}</p>
        </div>
      )}
    </>
  );
}

export default Orders;
