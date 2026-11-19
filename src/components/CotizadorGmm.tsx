"use client";

import { useState } from "react";
import { formatMXN } from "@/lib/format";
import { generarPdfGmm } from "@/lib/pdf-gmm";
import {
  BENEFICIO_MATERNIDAD,
  COASEGUROS,
  DEDUCIBLES,
  EDAD_MAXIMA,
  EMERGENCIA_EXTRANJERO,
  ESTADOS,
  FORMAS_PAGO,
  MAX_ASEGURADOS,
  NIVELES_HOSPITALARIOS,
  PARENTESCOS,
  SUMAS_ASEGURADAS,
  TABULADORES,
  TOPES_COASEGURO,
  type FormaPagoGmm,
  type ResultadoGmm,
  type SolicitudGmm,
} from "@/lib/gmm/opciones";

interface Fila {
  nombre: string;
  parentesco: string;
  sexo: "" | "F" | "M";
  edad: string;
}

const filaVacia = (parentesco: string): Fila => ({ nombre: "", parentesco, sexo: "", edad: "" });

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none";

function Select<T extends string | number>({
  label,
  value,
  opciones,
  onChange,
  formato = String,
}: {
  label: string;
  value: T;
  opciones: readonly T[];
  onChange: (v: T) => void;
  formato?: (v: T) => string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select
        className={campo}
        value={String(value)}
        onChange={(e) => onChange(opciones.find((o) => String(o) === e.target.value) as T)}
      >
        {opciones.map((o) => (
          <option key={String(o)} value={String(o)}>
            {formato(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function CotizadorGmm({ agente }: { agente: string }) {
  const [sumaAsegurada, setSuma] = useState<number>(50000000);
  const [deducible, setDeducible] = useState<number>(50000);
  const [coaseguro, setCoaseguro] = useState<number>(0.1);
  const [topeCoaseguro, setTope] = useState<number>(30000);
  const [nivelHospitalario, setNivel] = useState<string>("1 - AMPLIO");
  const [estado, setEstado] = useState<string>("CDMX y Z.M.");
  const [tabulador, setTabulador] = useState<string>("THQ BASE");
  const [formaPago, setFormaPago] = useState<FormaPagoGmm>("ANUAL");
  const [emergenciaExtranjero, setEmergencia] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([filaVacia("Titular")]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ solicitud: SolicitudGmm; r: ResultadoGmm } | null>(
    null,
  );

  const cambiarFila = (i: number, cambio: Partial<Fila>) =>
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  async function cotizar() {
    setError(null);
    const asegurados = filas.map((f) => ({
      nombre: f.nombre.trim(),
      parentesco: f.parentesco,
      sexo: f.sexo as "F" | "M",
      edad: Number(f.edad),
    }));
    if (asegurados.some((a, i) => !a.sexo || filas[i].edad === "" || !Number.isInteger(a.edad))) {
      setError("Captura sexo y edad de cada asegurado.");
      return;
    }
    const solicitud: SolicitudGmm = {
      sumaAsegurada,
      deducible,
      coaseguro,
      topeCoaseguro,
      nivelHospitalario,
      estado,
      tabulador,
      formaPago,
      emergenciaExtranjero,
      asegurados,
    };
    setCargando(true);
    try {
      const res = await fetch("/api/gmm/cotizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solicitud),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cotizar.");
      setResultado({ solicitud, r: data.resultado });
    } catch (e) {
      setResultado(null);
      setError(e instanceof Error ? e.message : "No se pudo cotizar.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gastos Médicos Mayores Individual</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cotizador Plenit AURA (tarifas del Excel GMMI 241125).
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Cobertura básica</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Suma asegurada" value={sumaAsegurada} opciones={SUMAS_ASEGURADAS} onChange={setSuma} formato={formatMXN} />
          <Select label="Deducible" value={deducible} opciones={DEDUCIBLES} onChange={setDeducible} formato={formatMXN} />
          <Select label="Coaseguro" value={coaseguro} opciones={COASEGUROS} onChange={setCoaseguro} formato={pct} />
          <Select label="Tope de coaseguro" value={topeCoaseguro} opciones={TOPES_COASEGURO} onChange={setTope} formato={formatMXN} />
          <Select label="Nivel hospitalario" value={nivelHospitalario} opciones={NIVELES_HOSPITALARIOS} onChange={setNivel} />
          <Select label="Estado" value={estado} opciones={ESTADOS} onChange={setEstado} />
          <Select label="Tabulador de honorarios" value={tabulador} opciones={TABULADORES} onChange={setTabulador} />
          <Select label="Forma de pago" value={formaPago} opciones={FORMAS_PAGO} onChange={setFormaPago} />
        </div>
        <h2 className="mb-2 mt-5 font-semibold text-slate-900">Coberturas adicionales</h2>
        <p className="text-sm text-slate-700">Servicios de asistencia: incluida.</p>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={emergenciaExtranjero} onChange={(e) => setEmergencia(e.target.checked)} />
          Emergencia en el extranjero (SA {formatMXN(EMERGENCIA_EXTRANJERO.sumaAsegurada)}, deducible{" "}
          {formatMXN(EMERGENCIA_EXTRANJERO.deducible)})
        </label>
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-slate-900">Asegurados</h2>
        <div className="space-y-2">
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_6rem_auto]">
              <input className={`${campo} col-span-2 sm:col-span-1`} placeholder="Nombre" value={f.nombre} onChange={(e) => cambiarFila(i, { nombre: e.target.value })} />
              <select className={campo} value={f.parentesco} onChange={(e) => cambiarFila(i, { parentesco: e.target.value })}>
                {PARENTESCOS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <select className={campo} value={f.sexo} onChange={(e) => cambiarFila(i, { sexo: e.target.value as Fila["sexo"] })}>
                <option value="">Sexo</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
              <input className={campo} type="number" min={0} max={EDAD_MAXIMA} placeholder="Edad" value={f.edad} onChange={(e) => cambiarFila(i, { edad: e.target.value })} />
              <button
                type="button"
                className="rounded-lg px-2 text-sm text-red-600 hover:bg-red-50 disabled:invisible"
                disabled={filas.length === 1}
                onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-sky-700 hover:underline disabled:text-slate-400"
          disabled={filas.length >= MAX_ASEGURADOS}
          onClick={() => setFilas((fs) => [...fs, filaVacia("Cónyuge")])}
        >
          + Agregar asegurado
        </button>
      </section>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="button"
        onClick={cotizar}
        disabled={cargando}
        className="mb-6 rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {cargando ? "Cotizando…" : "Cotizar"}
      </button>

      {resultado && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Resultado</h2>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              onClick={() => void generarPdfGmm(resultado.solicitud, resultado.r, agente)}
            >
              Descargar PDF para el cliente
            </button>
          </div>
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr>
                <th className="py-1">Asegurado</th>
                <th>Parentesco</th>
                <th>Sexo</th>
                <th>Edad</th>
                <th className="text-right">Prima neta anual</th>
              </tr>
            </thead>
            <tbody>
              {resultado.r.asegurados.map((a, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-1">{a.nombre || "—"}</td>
                  <td>{a.parentesco}</td>
                  <td>{a.sexo}</td>
                  <td>{a.edad}</td>
                  <td className="text-right">{formatMXN(a.prima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto max-w-sm space-y-1 text-sm">
            {[
              ["Prima neta anual", resultado.r.primaNeta],
              ["Derecho de póliza", resultado.r.derechoPoliza],
              ["Recargo por pago fraccionado", resultado.r.recargoFraccionado],
              ["Subtotal", resultado.r.subtotal],
              ["IVA", resultado.r.iva],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-slate-600">{k}</dt>
                <dd>{formatMXN(v as number)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
              <dt>Prima total</dt>
              <dd>{formatMXN(resultado.r.primaTotal)}</dd>
            </div>
            {resultado.r.numeroPagos > 1 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Primer pago</dt>
                  <dd>{formatMXN(resultado.r.primerPago)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Subsecuentes ({resultado.r.numeroPagos - 1})</dt>
                  <dd>{formatMXN(resultado.r.pagoSubsecuente)}</dd>
                </div>
              </>
            )}
          </dl>
          {resultado.r.beneficioMaternidad && (
            <p className="mt-3 text-sm text-slate-700">
              Incluye beneficio de maternidad de {formatMXN(BENEFICIO_MATERNIDAD)}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
