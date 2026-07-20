"use client";

import { useState } from "react";
import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import { formatMXN } from "@/lib/format";
import { generarPdfCotizacion } from "@/lib/pdf";

interface Props {
  resultados: CotizacionResultado[];
  request: CotizacionRequest | null;
}

export default function QuoteResults({ resultados, request }: Props) {
  const [pdfError, setPdfError] = useState<string | null>(null);
  const exitosas = resultados.filter((r) => r.status === "success");
  const conError = resultados.filter((r) => r.status !== "success");
  const mejorPrima = exitosas[0]?.prima?.primaTotal;

  function descargarPdf() {
    if (!request) return;
    try {
      generarPdfCotizacion(request, resultados);
      setPdfError(null);
    } catch (err) {
      console.error("No se pudo generar el PDF de la cotización:", err);
      setPdfError(
        "No se pudo generar el PDF. Intenta de nuevo o contacta a soporte.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Comparativa de cotizaciones
          </h2>
          <span className="text-sm text-slate-500">
            {exitosas.length} de {resultados.length} aseguradoras respondieron
          </span>
        </div>
        {request && exitosas.length > 0 && (
          <button
            type="button"
            onClick={descargarPdf}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
          >
            Descargar PDF para el cliente
          </button>
        )}
      </div>

      {pdfError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {pdfError}
        </div>
      )}

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
        <div className="flex flex-col items-end gap-1">
          {esMejor && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
              Mejor precio
            </span>
          )}
          {prima && prima.descuentoPorcentaje > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">
              −{prima.descuentoPorcentaje}% desc.
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs text-slate-500">Prima total anual</p>
        <p className="text-2xl font-bold text-slate-900">
          {prima ? formatMXN(prima.primaTotal) : "—"}
        </p>
      </div>

      {prima && (
        <dl className="mt-3 space-y-1 text-xs text-slate-600">
          {prima.descuentoPorcentaje > 0 && (
            <>
              <Row
                label="Prima neta (sin desc.)"
                value={formatMXN(prima.primaNetaSinDescuento)}
              />
              <div className="flex justify-between text-emerald-600">
                <dt>Descuento ({prima.descuentoPorcentaje}%)</dt>
                <dd className="font-medium">
                  −{formatMXN(prima.descuentoMonto)}
                </dd>
              </div>
            </>
          )}
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
