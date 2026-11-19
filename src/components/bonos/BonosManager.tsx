"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMXN } from "@/lib/format";
import type { Carga } from "@/lib/bonos/repositorio";
import BonosPeriodo from "./BonosPeriodo";
import BonosCatalogo from "./BonosCatalogo";
import { MESES, Mensajes, boton, botonSec, input, pedir, json, tarjeta } from "./comun";

const PESTANAS = [
  { id: "produccion", label: "Producción mensual" },
  { id: "agentes", label: "Agentes (bimestral)" },
  { id: "promotor", label: "Promotor (mensual)" },
  { id: "catalogo", label: "Catálogo y reglas" },
] as const;

type Pestana = (typeof PESTANAS)[number]["id"];

interface RespuestaCarga {
  tipo: "REPORTE" | "LIBRO";
  meses: string[];
  catalogo: number;
  agentesNuevos: string[];
  ramosNuevos: string[];
  cargas: Carga[];
}

function mesAnterior(): { anio: number; mes: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
}

export default function BonosManager() {
  const [pestana, setPestana] = useState<Pestana>("produccion");
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 border-b border-slate-200">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              pestana === p.id ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>
      {pestana === "produccion" && <Produccion />}
      {pestana === "agentes" && <BonosPeriodo tipo="AGENTE" />}
      {pestana === "promotor" && <BonosPeriodo tipo="PROMOTOR" />}
      {pestana === "catalogo" && <BonosCatalogo />}
    </div>
  );
}

function Produccion() {
  const inicial = mesAnterior();
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [ponderado, setPonderado] = useState("1");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    pedir<{ cargas: Carga[] }>("/api/bonos/cargas").then((d) => setCargas(d.cargas)).catch((e) => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    setAviso(null);
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("anio", String(anio));
    fd.append("mes", String(mes));
    fd.append("ponderado", ponderado);
    try {
      const d = await pedir<RespuestaCarga>("/api/bonos/cargas", { method: "POST", body: fd });
      setCargas(d.cargas);
      const lineas = [`Cargado: ${d.meses.join(", ")}.`];
      if (d.tipo === "LIBRO") lineas.push(`Catálogo: ${d.catalogo} agentes actualizados.`);
      if (d.agentesNuevos.length)
        lineas.push(`Agentes nuevos sin subpromotoría (asígnalos en Catálogo): ${d.agentesNuevos.join(", ")}.`);
      if (d.ramosNuevos.length) lineas.push(`Ramos nuevos sin % (revísalos en Catálogo): ${d.ramosNuevos.join(", ")}.`);
      setAviso(lineas.join("\n"));
      setArchivo(null);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  async function cambiarPonderado(c: Carga) {
    const v = window.prompt(`Ponderado de ${MESES[c.mes - 1]} ${c.anio}`, String(c.ponderado));
    if (v === null) return;
    try {
      setCargas((await pedir<{ cargas: Carga[] }>(`/api/bonos/cargas/${c.id}`, json({ ponderado: Number(v) }, "PATCH"))).cargas);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function eliminar(c: Carga) {
    if (!window.confirm(`¿Eliminar la producción de ${MESES[c.mes - 1]} ${c.anio}?`)) return;
    setCargas((await pedir<{ cargas: Carga[] }>(`/api/bonos/cargas/${c.id}`, { method: "DELETE" })).cargas);
  }

  return (
    <div className="space-y-6">
      <Mensajes error={error} aviso={aviso} />
      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Cargar reporte de El Potosí</h2>
        <p className="mt-1 text-xs text-slate-500">
          Sube el reporte &quot;Agentes Promotoría&quot; del mes (columnas Agente, Subgrupo, Prima cobrada). Si el mes ya
          estaba cargado, se reemplaza. También puedes subir tu libro de cierre con la hoja BASE 1 para cargar el
          histórico y el catálogo de agentes.
        </p>
        <form onSubmit={subir} className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_150px_110px_auto] sm:items-end">
          <label className="text-xs text-slate-600">
            Archivo Excel
            <input type="file" accept=".xlsx" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={input} />
          </label>
          <label className="text-xs text-slate-600">
            Año
            <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={input} />
          </label>
          <label className="text-xs text-slate-600">
            Mes de cierre
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={input}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Ponderado
            <input type="number" step="0.0001" value={ponderado} onChange={(e) => setPonderado(e.target.value)} className={input} />
          </label>
          <button type="submit" disabled={!archivo || subiendo} className={boton}>
            {subiendo ? "Cargando…" : "Cargar"}
          </button>
        </form>
      </section>

      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Meses cargados</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Mes</th>
                <th>Archivo</th>
                <th className="text-right">Renglones</th>
                <th className="text-right">Prima cobrada</th>
                <th className="text-right">Ponderado</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cargas.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{MESES[c.mes - 1]} {c.anio}</td>
                  <td className="max-w-xs truncate text-slate-600">{c.nombreOriginal}</td>
                  <td className="text-right tabular-nums">{c.filas}</td>
                  <td className="text-right tabular-nums">{formatMXN(c.primaCobrada)}</td>
                  <td className="text-right tabular-nums">
                    <button onClick={() => cambiarPonderado(c)} className="text-sky-700 hover:underline">{c.ponderado}</button>
                  </td>
                  <td className="text-right">
                    <button onClick={() => eliminar(c)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
              {cargas.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">Aún no hay meses cargados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div>
        <button className={botonSec} onClick={cargar}>Actualizar</button>
      </div>
    </div>
  );
}
