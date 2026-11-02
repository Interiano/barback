import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../auth";
import { itemId, useItems } from "../items";

function Count() {
  const { items, error, loading } = useItems();
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (loading) return <p className="muted">Loading your shelf…</p>;
  if (error) return <p>Error: {error}</p>;
  if (items.length === 0) return <p className="muted">No products yet.</p>;

  if (index >= items.length) {
    return (
      <section className="count-screen">
        <h1>Count complete</h1>
        <p className="muted">All {items.length} products are saved.</p>
        <Link to="/today" className="btn primary">Back to Today</Link>
      </section>
    );
  }

  const item = items[index];
  const current = Number(item.on_hand);
  const fullValue = full ?? Math.floor(current);
  const openValue = open ?? Math.round((current - Math.floor(current)) * 10) / 10;
  const total = Math.round((fullValue + openValue) * 10) / 10;

  function next() {
    setFull(null);
    setOpen(null);
    setSaveError("");
    setIndex(index + 1);
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const r = await api(`/items/${itemId(item)}`, {
        method: "PUT",
        body: JSON.stringify({ on_hand: total }),
      });
      if (!r.ok) throw new Error(`Save failed (${r.status})`);
      next();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="count-screen">
      <p className="muted">
        Product {index + 1} of {items.length}
      </p>
      <h1>{item.name}</h1>
      <p className="muted">Par {Number(item.par)}</p>

      <div className="count-row">
        <span>Full bottles</span>
        <div className="stepper">
          <button className="btn" onClick={() => setFull(Math.max(0, fullValue - 1))} aria-label="One less">−</button>
          <span className="stepper-value">{fullValue}</span>
          <button className="btn" onClick={() => setFull(fullValue + 1)} aria-label="One more">+</button>
        </div>
      </div>

      <div className="count-row">
        <label htmlFor="open">Open bottle</label>
        <span className="stepper-value">{Math.round(openValue * 100)}%</span>
      </div>
      <input
        id="open"
        type="range"
        min="0"
        max="0.9"
        step="0.1"
        value={openValue}
        onChange={(e) => setOpen(Number(e.target.value))}
        className="slider"
      />

      <p className="count-total">Total: {total}</p>
      {saveError && <p>Error: {saveError}</p>}

      <div className="hero-actions">
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save & next"}
        </button>
        <button className="btn" onClick={next} disabled={saving}>Skip</button>
      </div>
    </section>
  );
}

export default Count;