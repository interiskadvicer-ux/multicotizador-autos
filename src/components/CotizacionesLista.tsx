"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import type { EstadoCotizacion, ResumenCotizacion } from "@/lib/cotizaciones";
import { formatMXN } from "@/lib/format";
import type { LigasImpresion } from "@/lib/qualitas/impresion";

const ESTADO_META: Record<EstadoCotizacion, { label: string; cls: string }> = {
  GUARDADA: { label: "Guardada", cls: "bg-slate-100 text-slate-700" },
  EMISION_SOLICITADA: { label: "Emisión solicitada", cls: "bg-amber-50 text-amber-700" },
  EMITIDA: { label: "Emitida", cls: "bg-emerald-50 text-emerald-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-red-50 text-red-700" },
};

export default function CotizacionesLista({ esAdmin }: { esAdmin: boolean }) {
  const [cotizaciones, setCotizaciones] = useState<ResumenCotizacion[]>([]);
  const [filtro, setFiltro] = useState<EstadoCotizacion | "TODAS">("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emision, setEmision] = useState<{
    id: number;
    numeroPoliza: string;
    vigenciaInicio: string;
  } | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; ligas: [string, string][] } | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch("/api/cotizaciones");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las cotizaciones.");
      setCotizaciones(data.cotizaciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cancelar(c: ResumenCotizacion) {
    if (!window.confirm(`¿Cancelar la cotización #${c.id}?`)) return;
    setError(null);
    const res = await fetch(`/api/cotizaciones/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soloEstado: true, estado: "CANCELADA", notasAdmin: c.notasAdmin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "No se pudo actualizar.");
    else cargar();
  }

  async function emitir(e: React.FormEvent, c: ResumenCotizacion) {
    e.preventDefault();
    if (!emision) return;
    setEmitiendo(true);
    setError(null);
    const res = await fetch(`/api/cotizaciones/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        soloEstado: true,
        estado: "EMITIDA",
        numeroPoliza: emision.numeroPoliza,
        vigenciaInicio: emision.vigenciaInicio,
        notasAdmin: c.notasAdmin,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEmitiendo(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo registrar la emisión.");
      return;
    }
    setEmision(null);
    cargar();
  }

  async function emitirEnQualitas(c: ResumenCotizacion) {
    if (!emision) return;
    if (!window.confirm(`¿Emitir la cotización #${c.id} en Quálitas?`)) return;
    setEmitiendo(true);
    setError(null);
    setAviso(null);
    const res = await fetch(`/api/cotizaciones/${c.id}/emitir-qualitas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vigenciaInicio: emision.vigenciaInicio }),
    });
    const data = await res.json().catch(() => ({}));
    setEmitiendo(false);
    if (!res.ok) {
      setError(data.error ?? "Quálitas no emitió la póliza.");
      return;
    }
    const imp = data.impresion as LigasImpresion | null;
    setAviso({
      texto: `Quálitas emitió la póliza ${data.resultado.numeroPoliza} (ambiente ${data.resultado.ambiente}).${
        imp?.mensaje ? ` Impresión: ${imp.mensaje}` : ""
      }`,
      ligas: (imp?.documentos ?? []).map((d) => [d.etiqueta, d.url] as [string, string]),
    });
    setEmision(null);
    cargar();
  }

  async function emitirEnGs(c: ResumenCotizacion) {
    if (!emision) return;
    const previa = await fetch(`/api/cotizaciones/${c.id}/emitir-gs`).then((r) => r.json()).catch(() => null);
    if (previa?.faltantes?.length) {
      setError(`Faltan datos para emitir en General de Seguros: ${previa.faltantes.join(", ")}.`);
      return;
    }
    if (
      !window.confirm(
        `¿Emitir la cotización #${c.id} en General de Seguros (ambiente ${previa?.ambiente ?? "pruebas"})? Puede tardar hasta 3 minutos.`,
      )
    )
      return;
    setEmitiendo(true);
    setError(null);
    setAviso(null);
    const res = await fetch(`/api/cotizaciones/${c.id}/emitir-gs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vigenciaInicio: emision.vigenciaInicio }),
    });
    const data = await res.json().catch(() => ({}));
    setEmitiendo(false);
    if (!res.ok) {
      setError(data.error ?? "General de Seguros no emitió la póliza.");
      return;
    }
    setAviso({
      texto: `General de Seguros emitió la póliza ${data.resultado.numeroPoliza} (ambiente ${data.resultado.ambiente}).${
        data.resultado.caratulaGuardada ? " La carátula quedó guardada en Pólizas." : ""
      }`,
      ligas: ((data.documentos ?? []) as { etiqueta: string; url: string }[]).map(
        (d) => [d.etiqueta, d.url] as [string, string],
      ),
    });
    setEmision(null);
    cargar();
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = cotizaciones.filter(
    (c) =>
      (filtro === "TODAS" || c.estado === filtro) &&
      (!q ||
        [c.cliente, c.vehiculo, c.usuarioNombre, c.aseguradora, String(c.id)]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
  const conteo = (e: EstadoCotizacion) => cotizaciones.filter((c) => c.estado === e).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {(["TODAS", "GUARDADA", "EMISION_SOLICITADA", "EMITIDA", "CANCELADA"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                filtro === f ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f === "TODAS" ? `Todas (${cotizaciones.length})` : `${ESTADO_META[f].label} (${conteo(f)})`}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, vehículo…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-sky-500"
          />
          <Link
            href="/cotizar"
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            + Nueva cotización
          </Link>
        </div>
      </div>

      {aviso && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {aviso.texto}
          {aviso.ligas.map(([label, url]) => (
            <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="ml-3 font-semibold underline">
              {label} (PDF)
            </a>
          ))}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Fecha</th>
              {esAdmin && <th className="px-4 py-3">Usuario</th>}
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vehículo</th>
              <th className="px-4 py-3">Opción elegida</th>
              <th className="px-4 py-3 text-right">Prima total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No hay cotizaciones.
                </td>
              </tr>
            ) : (
              visibles.map((c) => {
                const meta = ESTADO_META[c.estado];
                return (
                  <Fragment key={c.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.id}</td>
                    <td className="px-4 py-3 text-slate-600">{c.updatedAt.slice(0, 10)}</td>
                    {esAdmin && <td className="px-4 py-3 text-slate-600">{c.usuarioNombre}</td>}
                    <td className="px-4 py-3 text-slate-800">{c.cliente || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.vehiculo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.aseguradora ? `${c.aseguradora} · ${c.paquete}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {c.primaTotal != null ? formatMXN(c.primaTotal) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
                        {meta.label}
                      </span>
                      {c.numeroPoliza && (
                        <span className="ml-1 text-xs text-slate-500">
                          Póliza{" "}
                          {c.polizaId && esAdmin ? (
                            <Link href="/polizas" className="text-sky-700 hover:underline">
                              {c.numeroPoliza}
                            </Link>
                          ) : (
                            c.numeroPoliza
                          )}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/cotizar?id=${c.id}`} className="text-xs font-medium text-sky-700 hover:underline">
                        Abrir
                      </Link>
                      {esAdmin && c.estado === "EMISION_SOLICITADA" && (
                        <button
                          type="button"
                          onClick={() =>
                            setEmision({
                              id: c.id,
                              numeroPoliza: c.numeroPoliza ?? "",
                              vigenciaInicio: new Date().toLocaleDateString("en-CA"),
                            })
                          }
                          className="ml-3 text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Marcar emitida
                        </button>
                      )}
                      {esAdmin && c.estado !== "EMITIDA" && c.estado !== "CANCELADA" && (
                        <button
                          type="button"
                          onClick={() => cancelar(c)}
                          className="ml-3 text-xs font-medium text-red-600 hover:underline"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                  {emision?.id === c.id && (
                    <tr className="bg-emerald-50/50">
                      <td colSpan={9} className="px-4 py-3">
                        <form onSubmit={(e) => emitir(e, c)} className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-slate-600">
                            Número de póliza
                            <input
                              required
                              value={emision.numeroPoliza}
                              onChange={(e) => setEmision({ ...emision, numeroPoliza: e.target.value })}
                              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            />
                          </label>
                          <label className="text-xs text-slate-600">
                            Inicio de vigencia
                            <input
                              type="date"
                              required
                              value={emision.vigenciaInicio}
                              onChange={(e) => setEmision({ ...emision, vigenciaInicio: e.target.value })}
                              className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                            />
                          </label>
                          <span className="text-xs text-slate-500">
                            Se registra en Pólizas por 1 año{c.usuarioNombre ? `, asignada a ${c.usuarioNombre}` : ""}.
                          </span>
                          <button
                            type="submit"
                            disabled={emitiendo}
                            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {emitiendo ? "Registrando…" : "Confirmar emisión"}
                          </button>
                          {c.seleccion?.aseguradoraId === "qualitas" && (
                            <button
                              type="button"
                              disabled={emitiendo}
                              onClick={() => emitirEnQualitas(c)}
                              className="rounded-lg border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {emitiendo ? "Emitiendo…" : "Emitir en Quálitas"}
                            </button>
                          )}
                          {c.seleccion?.aseguradoraId === "generalseguros" && (
                            <button
                              type="button"
                              disabled={emitiendo}
                              onClick={() => emitirEnGs(c)}
                              className="rounded-lg border border-emerald-600 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {emitiendo ? "Emitiendo (hasta 3 min)…" : "Emitir en General de Seguros"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEmision(null)}
                            className="text-sm text-slate-500 hover:underline"
                          >
                            Cancelar
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
