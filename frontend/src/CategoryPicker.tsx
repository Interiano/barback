import { useState } from "react";

type Props = {
  value: string;
  categories: string[];
  onChange: (category: string) => void;
  onCreate: (name: string) => Promise<void>;
  label: string;
};

const NEW = "__new__";

function CategoryPicker({ value, categories, onChange, onCreate, label }: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a category name.");
    setSaving(true);
    setError("");
    try {
      await onCreate(trimmed);
      onChange(trimmed);
      setCreating(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (creating) {
    return (
      <div className="picker">
        <input
          aria-label="New category name"
          className="field"
          placeholder="e.g. Sake"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn small" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="btn small" onClick={() => { setCreating(false); setError(""); }}>Cancel</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <select
      aria-label={label}
      className="field category"
      value={value}
      onChange={(e) => (e.target.value === NEW ? setCreating(true) : onChange(e.target.value))}
    >
      {!value && <option value="">Choose category…</option>}
      {categories.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option value={NEW}>+ New category…</option>
    </select>
  );
}

export default CategoryPicker;
