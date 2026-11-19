"use client";

import { useState } from "react";
import CotizadorGmm from "./CotizadorGmm";
import CotizadorGmmBanorte from "./CotizadorGmmBanorte";
import CotizadorGmmComparativo from "./CotizadorGmmComparativo";
import type { ProductoBanorte } from "@/lib/gmm/banorte/productos";

const PRODUCTOS: { clave: "COMPARATIVO" | "AURA" | ProductoBanorte; nombre: string }[] = [
  { clave: "COMPARATIVO", nombre: "Comparativo" },
  { clave: "AURA", nombre: "Plenit AURA" },
  { clave: "ESENCIAL", nombre: "Banorte Esencial" },
  { clave: "TOTAL", nombre: "Banorte Total" },
  { clave: "TRANSFORMA", nombre: "Banorte Plan Transforma" },
];

export default function CotizadorGmmProductos({ agente }: { agente: string }) {
  const [producto, setProducto] = useState<(typeof PRODUCTOS)[number]["clave"]>("COMPARATIVO");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {PRODUCTOS.map((p) => (
          <button
            key={p.clave}
            type="button"
            onClick={() => setProducto(p.clave)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              producto === p.clave ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      {producto === "COMPARATIVO" ? (
        <CotizadorGmmComparativo agente={agente} />
      ) : producto === "AURA" ? (
        <CotizadorGmm agente={agente} />
      ) : (
        <CotizadorGmmBanorte key={producto} producto={producto} agente={agente} />
      )}
    </div>
  );
}
