"use client";

import { useState } from "react";
import type {
  CotizacionRequest,
  CotizacionResultado,
  Paquete,
} from "@/domain/types";
import { ASEGURADORAS } from "@/insurers/registry";
import { formatMXN } from "@/lib/format";
import { generarPdfCotizacion } from "@/lib/pdf";

interface Props {
  resultados: CotizacionResultado[];
  request: CotizacionRequest | null;
  descuentos: Record<string, number>;
  recotizando: string | null;
  onRecotizar: (aseguradoraId: string, descuento: number) => void;
}

const COLUMNAS: { paquete: Paquete; label: string }[] = [
  { paquete: "AMPLIA", label: "Amplia" },
  { paquete: "LIMITADA", label: "Limitada" },
  { paquete: "RC", label: "Básica" },
];

interface Celda {
  aseguradoraId: string;
  paquete: Paquete;
}

export default function QuoteResults({
  resultados,
  request,
  descuentos,
  recotizando,
  onRecotizar,
}: Props) {
  const [detalle, setDetalle] = useState<Celda | null>(null);

  const porCelda = new Map<string, CotizacionResultado>();
  for (const r of resultados) porCelda.set(`${r.aseguradoraId}|${r.paquete}`, r);
  const celda = (id: string, p: Paquete) => porCelda.get(`${id}|${p}`);

  const mejorPorPaquete: Partial<Record<Paquete, number>> = {};
  for (const col of COLUMNAS) {
    const primas = resultados
      .filter((r) => r.paquete === col.paquete && r.status === "success")
      .map((r) => r.prima?.primaTotal ?? Infinity);
    if (primas.length) mejorPorPaquete[col.paquete] = Math.min(...primas);
  }

  // Aseguradoras en el orden de la mejor prima Amplia (las sin respuesta al
  // final), para que la comparativa quede ordenada de menor a mayor.
  const filas = [...ASEGURADORAS].sort((a, b) => {
    const pa = celda(a.id, "AMPLIA")?.prima?.primaTotal ?? Infinity;
    const pb = celda(b.id, "AMPLIA")?.prima?.primaTotal ?? Infinity;
    return pa - pb;
  });

  const exitosas = resultados.filter((r) => r.status === "success");
  const seleccionado = detalle
    ? celda(detalle.aseguradoraId, detalle.paquete)
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Comparativa de cotizaciones
          </h2>
          <span className="text-sm text-slate-500">
            Prima total anual por paquete. Toca una prima para ver el detalle.
          </span>
        </div>
        {request && exitosas.length > 0 && (
          <button
            type="button"
            onClick={() => generarPdfCotizacion(request, resultados)}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
          >
            Descargar PDF para el cliente
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="w-[28%] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Aseguradora
              </th>
              <th className="w-[16%] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                Descuento
              </th>
              {COLUMNAS.map((c) => (
                <th
                  key={c.paquete}
                  className="px-3 py-3 text-center text-sm font-semibold"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((a) => {
              const ocupado = recotizando === a.id;
              const abiertaEnFila = detalle?.aseguradoraId === a.id;
              return (
                <FilaAseguradora
                  key={a.id}
                  id={a.id}
                  nombre={a.nombre}
                  descuento={descuentos[a.id] ?? a.descuentoDefault}
                  ocupado={ocupado}
                  onRecotizar={(d) => onRecotizar(a.id, d)}
                  celdas={COLUMNAS.map((c) => {
                    const r = celda(a.id, c.paquete);
                    return {
                      paquete: c.paquete,
                      resultado: r,
                      esMejor:
                        r?.status === "success" &&
                        r.prima?.primaTotal === mejorPorPaquete[c.paquete],
                      activa: abiertaEnFila && detalle?.paquete === c.paquete,
                    };
                  })}
                  onCelda={(p) =>
                    setDetalle((d) =>
                      d?.aseguradoraId === a.id && d.paquete === p
                        ? null
                        : { aseguradoraId: a.id, paquete: p },
                    )
                  }
                  detalle={
                    abiertaEnFila && seleccionado ? (
                      <Detalle resultado={seleccionado} />
                    ) : null
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaAseguradora({
  nombre,
  descuento,
  ocupado,
  onRecotizar,
  celdas,
  onCelda,
  detalle,
}: {
  id: string;
  nombre: string;
  descuento: number;
  ocupado: boolean;
  onRecotizar: (descuento: number) => void;
  celdas: {
    paquete: Paquete;
    resultado?: CotizacionResultado;
    esMejor: boolean;
    activa: boolean;
  }[];
  onCelda: (paquete: Paquete) => void;
  detalle: React.ReactNode;
}) {
  const [editando, setEditando] = useState(String(descuento));
  const [enfocado, setEnfocado] = useState(false);
  const valor = enfocado ? editando : String(descuento);

  function confirmar() {
    setEnfocado(false);
    const n = Math.min(Math.max(Number(editando) || 0, 0), 100);
    if (n !== descuento) onRecotizar(n);
  }

  const esReal = celdas.some((c) => c.resultado?.origen === "real");

  return (
    <>
      <tr className={ocupado ? "opacity-60" : undefined}>
        <td className="px-4 py-3">
          <div className="font-semibold text-slate-800">{nombre}</div>
          {esReal && (
            <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
              Prima real
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="relative w-24">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 pr-6 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              value={valor}
              inputMode="numeric"
              disabled={ocupado}
              onFocus={() => {
                setEditando(String(descuento));
                setEnfocado(true);
              }}
              onChange={(e) =>
                setEditando(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
              }
              onBlur={confirmar}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              aria-label={`Descuento ${nombre}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              %
            </span>
          </div>
          {ocupado && (
            <span className="mt-1 block text-[10px] text-slate-500">
              Recotizando…
            </span>
          )}
        </td>
        {celdas.map((c) => (
          <td key={c.paquete} className="px-2 py-2 text-center">
            <CeldaPrima
              resultado={c.resultado}
              esMejor={c.esMejor}
              activa={c.activa}
              onClick={() => onCelda(c.paquete)}
            />
          </td>
        ))}
      </tr>
      {detalle && (
        <tr className="bg-slate-50">
          <td colSpan={2 + celdas.length} className="px-4 py-4">
            {detalle}
          </td>
        </tr>
      )}
    </>
  );
}

function CeldaPrima({
  resultado,
  esMejor,
  activa,
  onClick,
}: {
  resultado?: CotizacionResultado;
  esMejor: boolean;
  activa: boolean;
  onClick: () => void;
}) {
  if (!resultado) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  if (resultado.status !== "success" || !resultado.prima) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
        title={resultado.error}
      >
        No disponible <span className="font-bold text-rose-500">!</span>
      </span>
    );
  }
  const desc = resultado.prima.descuentoPorcentaje;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg px-2 py-2 text-lg font-bold transition ${
        activa
          ? "bg-sky-600 text-white"
          : esMejor
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "text-sky-700 hover:bg-sky-50"
      }`}
      title="Ver detalle"
    >
      {formatMXN(resultado.prima.primaTotal)}
      {desc > 0 && (
        <span
          className={`block text-[10px] font-medium ${
            activa ? "text-sky-100" : "text-slate-400"
          }`}
        >
          {desc}% desc. aplicado
        </span>
      )}
    </button>
  );
}

function Detalle({ resultado }: { resultado: CotizacionResultado }) {
  const prima = resultado.prima;
  const label = COLUMNAS.find((c) => c.paquete === resultado.paquete)?.label;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {resultado.aseguradora} · {label}
        </h4>
        {prima && (
          <dl className="mt-2 space-y-1 text-xs text-slate-600">
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
            <div className="flex justify-between border-t border-slate-200 pt-1 text-sm">
              <dt className="font-semibold text-slate-800">Prima total</dt>
              <dd className="font-bold text-slate-900">
                {formatMXN(prima.primaTotal)}
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-3 text-[10px] text-slate-400">
          {resultado.origen === "real"
            ? "Prima devuelta por el web service de la aseguradora."
            : "Prima estimada (simulada); la aseguradora aún no está conectada."}
          {resultado.noCotizacion && ` No. cotización ${resultado.noCotizacion}.`}
          {resultado.tiempoRespuestaMs != null &&
            ` Respuesta en ${resultado.tiempoRespuestaMs} ms.`}
        </p>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Coberturas
        </h4>
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {resultado.coberturas.map((c) => (
            <li key={c.nombre} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={
                    c.incluida ? "text-slate-700" : "text-slate-400 line-through"
                  }
                >
                  {c.nombre}
                </span>
                <span className="shrink-0 text-slate-500">
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
      </div>
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
