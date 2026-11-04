import { useState } from "react";
import { api } from "../auth";
import { isLow, useItems } from "../items";

type Unit = "btl" | "case";
type Line = { name: string; qty: number; unit: Unit };
type Result = { sent: boolean; summary?: string; message?: string };

function addLine(lines: Line[], add: Line) {
  const match = lines.find((l) => l.name.toLowerCase() === add.name.toLowerCase() && l.unit === add.unit);
  if (match) {
    return lines.map((l) => (l === match ? { ...l, qty: Math.min(999, l.qty + add.qty) } : l));
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

function Orders() {
  const { items, error, loading } = useItems();
  const [cart, setCart] = useState<Line[] | null>(null);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState<Unit>("btl");
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sendError, setSendError] = useState("");

  const low = items
    .filter(isLow)
    .map((i) => ({ name: i.name, qty: Math.ceil(Number(i.par) - Number(i.on_hand)), unit: "btl" as Unit }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = cart ?? low;
  const shown = items
    .filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  function update(next: Line[]) {
    setCart(next);
    setResult(null);
  }

  function addCustom() {
    const name = newName.trim();
    if (!name) return setFormError("Enter a product name.");
    if (!Number.isInteger(newQty) || newQty < 1 || newQty > 999) return setFormError("Quantity must be 1 to 999.");
    setFormError("");
    update(addLine(lines, { name, qty: newQty, unit: newUnit }));
    setNewName("");
    setNewQty(1);
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
                  <button className="btn small" onClick={() => update(addLine(lines, l))}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>All stock</h2>
          <label htmlFor="search" className="muted">Search inventory</label>
          <input
            id="search"
            className="field"
            placeholder="e.g. gin"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <table className="sheet">
            <thead>
              <tr>
                <th>Product</th>
                <th>On hand</th>
                <th>Par</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.SK} className={isLow(i) ? "low-row" : ""}>
                  <td>{i.name}</td>
                  <td>{Number(i.on_hand)}</td>
                  <td>{Number(i.par)}</td>
                  <td>
                    <button className="btn small" onClick={() => update(addLine(lines, { name: i.name, qty: 1, unit: "btl" }))}>
                      Add
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">No match. Add it below as a new line.</td>
                </tr>
              )}
            </tbody>
          </table>
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
            onChange={(e) => setNewQty(Number(e.target.value))}
          />
          <select aria-label="Unit" className="field unit" value={newUnit} onChange={(e) => setNewUnit(e.target.value as Unit)}>
            <option value="btl">btl</option>
            <option value="case">case</option>
          </select>
          <button className="btn" onClick={addCustom}>Add to order</button>
        </div>
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
                        onChange={(e) =>
                          update(lines.map((x) => (x === l ? { ...x, qty: Math.max(1, Math.min(999, Math.round(Number(e.target.value)) || 1)) } : x)))
                        }
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
