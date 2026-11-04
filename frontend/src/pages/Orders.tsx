import { useState } from "react";
import { api } from "../auth";
import { isLow, useItems } from "../items";

type Result = { sent: boolean; products?: number; bottles?: number; message?: string };

function Orders() {
  const { items, error, loading } = useItems();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sendError, setSendError] = useState("");

  const lines = items
    .filter(isLow)
    .map((i) => ({ name: i.name, unit: i.unit ?? "btl", qty: Math.ceil(Number(i.par) - Number(i.on_hand)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function send() {
    setSending(true);
    setSendError("");
    setResult(null);
    try {
      const r = await api("/orders/send", { method: "POST" });
      if (r.status === 403) throw new Error("Only owners can send orders.");
      if (!r.ok) throw new Error(`Send failed (${r.status})`);
      setResult(await r.json());
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

      {lines.length === 0 ? (
        <p className="muted">Everything is at par. Nothing to order.</p>
      ) : (
        <section className="order-sheet">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Order</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td>
                    {l.qty} {l.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn primary" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send order"}
          </button>
        </section>
      )}

      {sendError && <p>Error: {sendError}</p>}

      {result && (
        <div className="toast" role="status">
          <img src="/avatar.png" alt="" className="avatar small" />
          <p>
            {result.sent
              ? `Order sent. ${result.products} products, ${result.bottles} bottles.`
              : result.message}
          </p>
        </div>
      )}
    </>
  );
}

export default Orders;