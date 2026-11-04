import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Inventory from "./pages/Inventory";
import Today from "./pages/Today";
import Count from "./pages/Count";
import Orders from "./pages/Orders";
import "./App.css";

const pages = [
  { path: "/today", label: "Today" },
  { path: "/inventory", label: "Inventory" },
  { path: "/lab", label: "Cocktail Lab" },
  { path: "/orders", label: "Par & Orders" },
  { path: "/recipes", label: "Recipes" },
  { path: "/team", label: "Team" },
  { path: "/settings", label: "Settings" },
];

function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="muted">Coming in a later build.</p>
    </>
  );
}

function App() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") ?? "light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Barback</div>
        {pages.map((p) => (
          <NavLink key={p.path} to={p.path} className="navlink">
            {p.label}
          </NavLink>
        ))}
        <button className="toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </nav>

      <main className="page">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/count" element={<Count />} />
          <Route path="/orders" element={<Orders />} />
          {pages
            .filter((p) => !["/today", "/inventory", "/orders"].includes(p.path))
            .map((p) => (
              <Route key={p.path} path={p.path} element={<ComingSoon title={p.label} />} />
            ))}
        </Routes>
      </main>
    </div>
  );
}

export default App;