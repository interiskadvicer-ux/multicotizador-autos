"use client";

import { useEffect, useState } from "react";
import { formatMXN } from "@/lib/format";
import type { CampoGmm, ProductoBanorte, ResultadoBanorte } from "@/lib/gmm/banorte/productos";

interface Fila {
  nombre: string;
  sexo: "" | "F" | "M";
  edad: string;
}

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none";

function mostrar(o: string | number, formato?: CampoGmm["formato"]): string {
  if (typeof o !== "number") return o;
  if (formato === "dinero") return formatMXN(o);
  if (formato === "porcentaje") return `${Math.round(o * 100)}%`;
  return String(o);
}

export default function CotizadorGmmBanorte({ producto, agente }: { producto: ProductoBanorte; agente: string }) {
  const [campos, setCampos] = useState<CampoGmm[]>([]);
  const [valores, setValores] = useState<Record<string, string | number>>({});
  const [filas, setFilas] = useState<Fila[]>([{ nombre: "", sexo: "", edad: "" }]);
  const [resultado, setResultado] = useState<ResultadoBanorte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setResultado(null);
    setError(null);
    setCampos([]);
    fetch(`/api/gmm/banorte?producto=${producto}`)
      .then((r) => r.json())
      .then((d: { campos?: CampoGmm[]; error?: string }) => {
        if (!d.campos) throw new Error(d.error ?? "No se pudo cargar el cotizador.");
        setCampos(d.campos);
        setValores(Object.fromEntries(d.campos.map((c) => [c.clave, c.valor])));
      })
      .catch((e: Error) => setError(e.message));
  }, [producto]);

  const cambiarFila = (i: number, cambio: Partial<Fila>) => {
    setResultado(null);
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  };

  async function cotizar() {
    setError(null);
    if (filas.some((f) => !f.sexo || f.edad === "" || !Number.isInteger(Number(f.edad)))) {
      setError("Captura sexo y edad de cada asegurado.");
      return;
    }
    setCargando(true);
    try {
      const res = await fetch("/api/gmm/banorte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producto,
          valores,
          asegurados: filas.map((f) => ({ nombre: f.nombre.trim(), sexo: f.sexo, edad: Number(f.edad) })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cotizar.");
      setResultado(data.resultado);
    } catch (e) {
      setResultado(null);
      setError(e instanceof Error ? e.message : "No se pudo cotizar.");
    } finally {
      setCargando(false);
    }
  }

  const imprimir = async () => {
    if (!resultado) return;
    const { generarPdfGmmBanorte } = await import("@/lib/pdf-gmm-banorte");
    await generarPdfGmmBanorte(campos, valores, resultado, agente);
  };

  return (
    <>
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Datos de la póliza y coberturas</h2>
        {campos.length === 0 && !error && <p className="text-sm text-slate-500">Cargando…</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campos.map((c) => (
            <label key={c.clave} className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">{c.etiqueta}</span>
              <select
                className={campo}
                value={String(valores[c.clave] ?? "")}
                onChange={(e) => {
                  setResultado(null);
                  setValores((v) => ({
                    ...v,
                    [c.clave]: c.opciones.find((o) => String(o) === e.target.value) ?? e.target.value,
                  }));
                }}
              >
                {c.opciones.map((o) => (
                  <option key={String(o)} value={String(o)}>
                    {mostrar(o, c.formato)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Asegurados</h2>
        <p className="mb-2 text-xs text-slate-500">
          El primero es el titular. En cotización familiar, el segundo es el cónyuge y los demás, dependientes.
        </p>
        <div className="space-y-2">
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_6rem_auto]">
              <input className={`${campo} col-span-2 sm:col-span-1`} placeholder="Nombre" value={f.nombre} onChange={(e) => cambiarFila(i, { nombre: e.target.value })} />
              <select className={campo} value={f.sexo} onChange={(e) => cambiarFila(i, { sexo: e.target.value as Fila["sexo"] })}>
                <option value="">Sexo</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
              <input className={campo} type="number" min={0} max={100} placeholder="Edad" value={f.edad} onChange={(e) => cambiarFila(i, { edad: e.target.value })} />
              <button
                type="button"
                className="rounded-lg px-2 text-sm text-red-600 hover:bg-red-50 disabled:invisible"
                disabled={filas.length === 1}
                onClick={() => {
                  setResultado(null);
                  setFilas((fs) => fs.filter((_, j) => j !== i));
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-sky-700 hover:underline disabled:text-slate-400"
          disabled={filas.length >= 8}
          onClick={() => {
            setResultado(null);
            setFilas((fs) => [...fs, { nombre: "", sexo: "", edad: "" }]);
          }}
        >
          + Agregar asegurado
        </button>
      </section>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="button"
        onClick={cotizar}
        disabled={cargando || campos.length === 0}
        className="mb-6 rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {cargando ? "Cotizando…" : "Cotizar"}
      </button>

      {resultado && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">{resultado.nombre}</h2>
            <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" onClick={() => void imprimir()}>
              Descargar PDF para el cliente
            </button>
          </div>
          {resultado.avisos.length > 0 && (
            <ul className="mb-3 list-disc rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-800">
              {resultado.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr>
                <th className="py-1">Asegurado</th>
                <th>Parentesco</th>
                <th>Sexo</th>
                <th>Edad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {resultado.asegurados.map((a, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{a.nombre || "—"}</td>
                  <td>{a.parentesco}</td>
                  <td>{a.sexo}</td>
                  <td>{a.edad}</td>
                  <td className="text-red-600">{a.aviso}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr>
                <th className="py-1">Forma de pago</th>
                <th className="text-right">Primer recibo</th>
                <th className="text-right">Recibos subsecuentes</th>
                <th className="text-right">Total anual</th>
              </tr>
            </thead>
            <tbody>
              {resultado.pagos.map((p) => (
                <tr key={p.forma} className="border-t border-slate-100">
                  <td className="py-1 font-medium">{p.forma}</td>
                  <td className="text-right">{formatMXN(p.primerRecibo)}</td>
                  <td className="text-right">{p.subsecuentes ? formatMXN(p.subsecuentes) : "—"}</td>
                  <td className="text-right font-semibold">{formatMXN(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
