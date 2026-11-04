import type { ReactNode } from "react";

function StockCard({ name, onHand, par, children }: { name: string; onHand: number; par: number; children?: ReactNode }) {
  const have = Number(onHand);
  const need = Number(par);
  const low = have < need;
  const percent = Math.min(100, Math.round((have / need) * 100));

  return (
    <div className={low ? "card low" : "card"}>
      <h3>{name}</h3>
      <p className="count">
        {have} of {need} {low ? "· below par" : ""}
      </p>
      <div className="track">
        <div className="fill" style={{ width: percent + "%" }} />
      </div>
      {children}
    </div>
  );
}

export default StockCard;
