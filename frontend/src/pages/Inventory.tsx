import StockCard from "../StockCard";
import { useItems } from "../items";

function Inventory() {
  const { items, error } = useItems();

  return (
    <>
      <h1>Inventory</h1>
      {error && <p>Error: {error}</p>}
      <div className="grid">
        {items.map((i) => (
          <StockCard key={i.SK} name={i.name} onHand={i.on_hand} par={i.par} />
        ))}
      </div>
    </>
  );
}

export default Inventory;