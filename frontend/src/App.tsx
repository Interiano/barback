import { useEffect, useState } from "react"; /*brings two tools from react*/
import { api } from "./auth"; /*loads your api helper from auth.ts*/
/*type Item describes one item from your api*/
type Item = { SK: string; name: string; on_hand: number; par: number };
/*StockCard component: one card showing a name and "2 of 6"*/
function StockCard({ name, onHand, par }: { name: string; onHand: number; par: number }) {
  return (
    <div>
      <h3>{name}</h3>
      <p>{onHand} of {par}</p>
    </div>
  );
}

function App() {
  const [items, setItems] = useState<Item[]>([]); /*cost[items, setItems] goes inside the App function, at the top. items stars as an empty list*/
  const [error, setError] = useState(""); /*a second piece of state: an error message, empty to start*/

  useEffect(() => { /*when the page opens, call GET /items, read the json, and save the list with setItems, which redraws the page. if anything fails, save the errorso you can see it*/
    api("/items")
      .then((r) => r.json())
      .then(setItems)
      .catch((e) => setError(String(e)));
  }, []); /*[] means run the code once, not on redraw*/

  return ( /**/
    <main>
      <h1>Inventory</h1>
      {error && <p>Error: {error}</p>} {/*show error only if there is one*/}
      {items.map((i) => ( /*one StockCard per item. key={i.SK} gives each card a uniqued ID so react can track it.*/
        <StockCard key={i.SK} name={i.name} onHand={i.on_hand} par={i.par} />
      ))}
    </main>
  );
}
export default App; /*makes App available to main.tsx*/