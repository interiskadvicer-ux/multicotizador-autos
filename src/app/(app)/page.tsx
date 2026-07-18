"use client";

import { useState } from "react";
import QuoteForm from "@/components/QuoteForm";
import QuoteResults from "@/components/QuoteResults";
import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import { ASEGURADORAS } from "@/insurers/registry";

export default function Home() {
  const [resultados, setResultados] = useState<CotizacionResultado[] | null>(
    null,
  );
  const [ultimaSolicitud, setUltimaSolicitud] =
    useState<CotizacionRequest | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cotizar(request: CotizacionRequest) {
    setCargando(true);
    setError(null);
    setResultados(null);
    setUltimaSolicitud(request);
    try {
      const res = await fetch("/api/cotizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo completar la cotización.");
      }
      const data = await res.json();
      setResultados(data.resultados as CotizacionResultado[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Multicotizador de Autos
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Compara en un solo lugar las primas y coberturas de{" "}
          {ASEGURADORAS.length} aseguradoras.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ASEGURADORAS.map((a) => (
            <span
              key={a.id}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
            >
              {a.nombre}
            </span>
          ))}
        </div>
      </header>

      <QuoteForm onCotizar={cotizar} cargando={cargando} />

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {cargando && (
        <div className="mt-8 flex items-center gap-3 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          Consultando web services de las aseguradoras…
        </div>
      )}

      {resultados && (
        <div className="mt-8">
          <QuoteResults resultados={resultados} request={ultimaSolicitud} />
        </div>
      )}
    </main>
  );
}
