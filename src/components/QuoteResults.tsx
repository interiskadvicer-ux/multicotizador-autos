"use client";

import { useState } from "react";
import type { CotizacionResultado } from "@/domain/types";
import { formatMXN } from "@/lib/format";

interface Props {
  resultados: CotizacionResultado[];
}

export default function QuoteResults({ resultados }: Props) {
  const exitosas = resultados.filter((r) => r.status === "success");
  const conError = resultados.filter((r) => r.status !== "success");
  const mejorPrima = exitosas[0]?.prima?.primaTotal;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          Comparativa de cotizaciones
        </h2>
        <span className="text-sm text-slate-500">
          {exitosas.length} de {resultados.length} aseguradoras respondieron
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {exitosas.map((r) => (
          <InsurerCard
            key={r.aseguradoraId}
            resultado={r}
            esMejor={r.prima?.primaTotal === mejorPrima}
          />
        ))}
      </div>

      {conError.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            No respondieron:
          </p>
          <ul className="mt-1 space-y-1 text-xs text-amber-700">
            {conError.map((r) => (
              <li key={r.aseguradoraId}>
                <span className="font-semibold">{r.aseguradora}:</span>{" "}
                {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InsurerCard({
  resultado,
  esMejor,
}: {
  resultado: CotizacionResultado;
  esMejor: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const prima = resultado.prima;

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
        esMejor ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            {resultado.aseguradora}
          </h3>
          <p className="text-xs text-slate-500">Paquete {resultado.paquete}</p>
        </div>
        {esMejor && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
            Mejor precio
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-xs text-slate-500">Prima total anual</p>
        <p className="text-2xl font-bold text-slate-900">
          {prima ? formatMXN(prima.primaTotal) : "—"}
        </p>
      </div>

      {prima && (
        <dl className="mt-3 space-y-1 text-xs text-slate-600">
          <Row label="Prima neta" value={formatMXN(prima.primaNeta)} />
          {prima.recargoPagoFraccionado > 0 && (
            <Row
              label="Recargo pago fraccionado"
              value={formatMXN(prima.recargoPagoFraccionado)}
            />
          )}
          <Row label="Derechos de póliza" value={formatMXN(prima.derechos)} />
          <Row label="IVA" value={formatMXN(prima.iva)} />
        </dl>
      )}

      <button
        onClick={() => setAbierto((v) => !v)}
        className="mt-4 text-left text-xs font-semibold text-sky-600 hover:text-sky-700"
      >
        {abierto ? "Ocultar coberturas ▲" : "Ver coberturas ▼"}
      </button>

      {abierto && (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {resultado.coberturas.map((c) => (
            <li key={c.nombre} className="text-xs">
              <div className="flex items-center justify-between">
                <span
                  className={
                    c.incluida ? "text-slate-700" : "text-slate-400 line-through"
                  }
                >
                  {c.nombre}
                </span>
                <span className="text-slate-500">
                  {c.incluida ? c.sumaAsegurada ?? "Incluida" : "No incluida"}
                </span>
              </div>
              {c.incluida && c.deducible && c.deducible !== "N/A" && (
                <div className="text-[10px] text-slate-400">
                  Deducible: {c.deducible}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {resultado.tiempoRespuestaMs != null && (
        <p className="mt-3 text-[10px] text-slate-400">
          Respuesta en {resultado.tiempoRespuestaMs} ms
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
