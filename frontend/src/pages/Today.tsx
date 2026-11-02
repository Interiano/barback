import { Link } from "react-router-dom";
import StockCard from "../StockCard";
import { isLow, useItems } from "../items";

function Today() {
  const { items, error, loading } = useItems();
  const lowCount = items.filter(isLow).length;
  const day = new Date().toLocaleDateString(undefined, { weekday: "long" });

  const lowestFirst = [...items].sort(
    (a, b) => Number(a.on_hand) / Number(a.par) - Number(b.on_hand) / Number(b.par)
  );

  return (
    <>
      <section className="hero">
        <p className="hero-day">{day}</p>
        <h1>
          {loading
            ? "Checking your shelf…"
            : lowCount === 0
              ? "Everything is at par."
              : `${lowCount} ${lowCount === 1 ? "product is" : "products are"} below par.`}
        </h1>
        <div className="hero-actions">
          <Link to="/orders" className="btn primary">Review & send order</Link>
          <Link to="/count" className="btn">Start shift count</Link>
        </div>
      </section>

      <section className="lab-box">
        <img src="/avatar.png" alt="Barback, the app's bartender" className="avatar" />
        <div>
          <h2>Cocktail Lab</h2>
          <p className="muted">
            I'll build drinks from what's on your shelf and help move overstock. Coming in Build 6.
          </p>
          <Link to="/lab" className="btn">Open the Lab</Link>
        </div>
      </section>

      <h2>Stock vs par</h2>
      <p className="muted">Lowest first</p>
      {error && <p>Error: {error}</p>}
      <div className="grid">
        {lowestFirst.map((i) => (
          <StockCard key={i.SK} name={i.name} onHand={i.on_hand} par={i.par} />
        ))}
      </div>
    </>
  );
}

export default Today;