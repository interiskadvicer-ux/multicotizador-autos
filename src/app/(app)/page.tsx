"use client";

import { useState } from "react";
import QuoteForm from "@/components/QuoteForm";
import QuoteResults from "@/components/QuoteResults";
import type { CotizacionRequest, CotizacionResultado } from "@/domain/types";
import { ASEGURADORAS } from "@/insurers/registry";

function descuentosIniciales(): Record<string, number> {
  return Object.fromEntries(
    ASEGURADORAS.map((a) => [a.id, a.descuentoDefault]),
  );
}

async function pedirCotizacion(
  request: CotizacionRequest,
): Promise<CotizacionResultado[]> {
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
  return data.resultados as CotizacionResultado[];
}

export default function Home() {
  const [resultados, setResultados] = useState<CotizacionResultado[] | null>(
    null,
  );
  const [ultimaSolicitud, setUltimaSolicitud] =
    useState<CotizacionRequest | null>(null);
  const [descuentos, setDescuentos] =
    useState<Record<string, number>>(descuentosIniciales);
  const [cargando, setCargando] = useState(false);
  const [recotizando, setRecotizando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cotizar(request: CotizacionRequest) {
    const completa: CotizacionRequest = { ...request, descuentos };
    setCargando(true);
    setError(null);
    setResultados(null);
    setUltimaSolicitud(completa);
    try {
      setResultados(await pedirCotizacion(completa));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  // Recotiza una sola aseguradora (sus 3 paquetes) con un nuevo descuento y
  // reemplaza sus filas en la comparativa.
  async function recotizar(aseguradoraId: string, descuento: number) {
    if (!ultimaSolicitud) return;
    const nuevosDescuentos = { ...descuentos, [aseguradoraId]: descuento };
    const request: CotizacionRequest = {
      ...ultimaSolicitud,
      descuentos: nuevosDescuentos,
      aseguradoras: [aseguradoraId],
    };
    setDescuentos(nuevosDescuentos);
    setUltimaSolicitud({ ...ultimaSolicitud, descuentos: nuevosDescuentos });
    setRecotizando(aseguradoraId);
    setError(null);
    try {
      const nuevos = await pedirCotizacion(request);
      // La aseguradora puede recortar el descuento a su tope: el input debe
      // reflejar el porcentaje realmente aplicado.
      const aplicados = nuevos
        .filter((r) => r.status === "success" && r.prima)
        .map((r) => r.prima!.descuentoPorcentaje);
      if (aplicados.length) {
        const efectivo = Math.max(...aplicados);
        if (efectivo !== descuento) {
          setDescuentos((d) => ({ ...d, [aseguradoraId]: efectivo }));
        }
      }
      setResultados((prev) => [
        ...(prev ?? []).filter((r) => r.aseguradoraId !== aseguradoraId),
        ...nuevos,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setRecotizando(null);
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
          <QuoteResults
            resultados={resultados}
            request={ultimaSolicitud}
            descuentos={descuentos}
            recotizando={recotizando}
            onRecotizar={recotizar}
          />
        </div>
      )}
    </main>
  );
}
