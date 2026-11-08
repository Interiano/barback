import { useEffect, useState } from "react";
import { api } from "../auth";

type Pantry = { options: string[]; enabled: string[]; custom: string[] };

function Settings() {
  const [options, setOptions] = useState<string[]>([]);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/pantry")
      .then((r) => r.json())
      .then((p: Pantry) => {
        setOptions(p.options);
        setEnabled(p.enabled);
        setCustom(p.custom);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function change(nextEnabled: string[], nextCustom: string[]) {
    setEnabled(nextEnabled);
    setCustom(nextCustom);
    setDirty(true);
    setMessage("");
    setError("");
  }

  function toggle(option: string) {
    change(enabled.includes(option) ? enabled.filter((e) => e !== option) : [...enabled, option], custom);
  }

  function addCustom() {
    const name = newItem.trim();
    if (!name) return setError("Enter an ingredient name.");
    const taken = [...options, ...custom].some((x) => x.toLowerCase() === name.toLowerCase());
    if (taken) return setError(`${name} is already on the list.`);
    change(enabled, [...custom, name]);
    setNewItem("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await api("/pantry", { method: "PUT", body: JSON.stringify({ enabled, custom }) });
      if (r.status === 403) throw new Error("Only owners can change house basics.");
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${r.status})`);
      }
      const p: Pantry = await r.json();
      setEnabled(p.enabled);
      setCustom(p.custom);
      setDirty(false);
      setMessage("Saved. The bartender will use these from the next conversation.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Loading settings…</p>;

  return (
    <>
      <h1>Settings</h1>

      <section className="panel">
        <h2>House basics</h2>
        <p className="muted">
          Ingredients your bar always keeps but doesn't track in inventory. The AI bartender may use only what's switched on, plus ice and water.
        </p>

        <div className="toggle-grid">
          {options.map((o) => (
            <label key={o} className={enabled.includes(o) ? "toggle-item on" : "toggle-item"}>
              <input type="checkbox" checked={enabled.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>

        <h3 className="sub-title">Your own additions</h3>
        {custom.length === 0 && <p className="muted small-text">None yet.</p>}
        <div className="chips">
          {custom.map((c) => (
            <span key={c} className="chip active">
              {c}
              <button className="chip-remove" aria-label={`Remove ${c}`} onClick={() => change(enabled, custom.filter((x) => x !== c))}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="add-row">
          <input
            aria-label="New house basic"
            className="field"
            placeholder="e.g. Yuzu juice, Thai basil"
            maxLength={30}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <button className="btn" onClick={addCustom}>Add</button>
        </div>

        <div className="save-row">
          <button className="btn primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && <span className="muted small-text">Unsaved changes</span>}
        </div>
        {message && <p className="muted">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}

export default Settings;
