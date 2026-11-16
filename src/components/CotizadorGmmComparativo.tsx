"use client";

import { useEffect, useState } from "react";
import { formatMXN } from "@/lib/format";
import type { CampoGmm, ProductoBanorte, ResultadoBanorte } from "@/lib/gmm/banorte/productos";
import {
  BASE_COASEGUROS,
  BASE_DEDUCIBLES,
  BASE_ESTADOS,
  BASE_SUMAS,
  CAMPOS_AURA,
  PRODUCTOS_GMM,
  RENGLONES,
  homologar,
  mostrarValor,
  primaAura,
  primaBanorte,
  solicitudAura,
  type BaseComparativo,
  type PrimaComparativo,
  type ProductoGmm,
} from "@/lib/gmm/comparativo";
import { FORMAS_PAGO, PARENTESCOS, type FormaPagoGmm, type ResultadoGmm } from "@/lib/gmm/opciones";

interface Fila {
  nombre: string;
  parentesco: string;
  sexo: "" | "F" | "M";
  edad: string;
}

type Resultado = { prima: PrimaComparativo } | { error: string };

const BANORTE: ProductoBanorte[] = ["ESENCIAL", "TOTAL", "TRANSFORMA"];
const MAX_FILAS = 13;

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none";

const filaVacia = (parentesco: string): Fila => ({ nombre: "", parentesco, sexo: "", edad: "" });

function Select<T extends string | number>({
  label,
  value,
  opciones,
  onChange,
  formato = (o) => String(o),
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

const nombreDe = (p: ProductoGmm) => PRODUCTOS_GMM.find((x) => x.clave === p)!.nombre;

export default function CotizadorGmmComparativo({ agente }: { agente: string }) {
  const [base, setBase] = useState<BaseComparativo>({ sa: 50000000, ded: 50000, coa: 0.1, estado: "CDMX y Z.M." });
  const [formaPago, setFormaPago] = useState<FormaPagoGmm>("ANUAL");
  const [filas, setFilas] = useState<Fila[]>([filaVacia("Titular")]);
  const [camposBanorte, setCamposBanorte] = useState<Partial<Record<ProductoBanorte, CampoGmm[]>>>({});
  const [ajustes, setAjustes] = useState<Partial<Record<ProductoGmm, Record<string, string | number>>>>({});
  const [resultados, setResultados] = useState<Partial<Record<ProductoGmm, Resultado>>>({});
  const [cargando, setCargando] = useState<ProductoGmm[]>([]);
  const [editando, setEditando] = useState<ProductoGmm | null>(null);
  const [enPdf, setEnPdf] = useState<ProductoGmm[]>(PRODUCTOS_GMM.map((p) => p.clave));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    for (const p of BANORTE)
      fetch(`/api/gmm/banorte?producto=${p}`)
        .then((r) => r.json())
        .then((d: { campos?: CampoGmm[]; error?: string }) => {
          if (!d.campos) throw new Error(d.error ?? "No se pudo cargar el cotizador de Banorte.");
          setCamposBanorte((c) => ({ ...c, [p]: d.campos }));
        })
        .catch((e: Error) => setError(e.message));
  }, []);

  const listo = BANORTE.every((p) => camposBanorte[p]);
  const camposDe = (p: ProductoGmm): CampoGmm[] => (p === "AURA" ? CAMPOS_AURA : camposBanorte[p] ?? []);
  const valoresDe = (p: ProductoGmm, aj = ajustes) => ({
    ...homologar(camposDe(p), base, filas.length),
    ...aj[p],
  });

  const limpiar = () => setResultados({});

  function cambiarBase(cambio: Partial<BaseComparativo>) {
    limpiar();
    setBase((b) => ({ ...b, ...cambio }));
    // Un cambio en la captura común reemplaza los ajustes manuales de ese dato.
    setAjustes((a) =>
      Object.fromEntries(
        Object.entries(a).map(([p, v]) => [
          p,
          Object.fromEntries(Object.entries(v ?? {}).filter(([k]) => !(k in cambio))),
        ]),
      ),
    );
  }

  const cambiarFila = (i: number, cambio: Partial<Fila>) => {
    limpiar();
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  };

  function asegurados() {
    return filas.map((f) => ({
      nombre: f.nombre.trim(),
      parentesco: f.parentesco,
      sexo: f.sexo as "F" | "M",
      edad: Number(f.edad),
    }));
  }

  async function cotizarUno(p: ProductoGmm, valores: Record<string, string | number>) {
    setCargando((c) => [...c, p]);
    let r: Resultado;
    try {
      const res =
        p === "AURA"
          ? await fetch("/api/gmm/cotizar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(solicitudAura(valores, formaPago, asegurados())),
            })
          : await fetch("/api/gmm/banorte", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ producto: p, valores, asegurados: asegurados() }),
            });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cotizar.");
      r = {
        prima:
          p === "AURA"
            ? primaAura(data.resultado as ResultadoGmm)
            : primaBanorte(data.resultado as ResultadoBanorte, formaPago),
      };
    } catch (e) {
      r = { error: e instanceof Error ? e.message : "No se pudo cotizar." };
    }
    setResultados((rs) => ({ ...rs, [p]: r }));
    setCargando((c) => c.filter((x) => x !== p));
  }

  function cotizar() {
    setError(null);
    if (filas.some((f) => !f.sexo || f.edad === "" || !Number.isInteger(Number(f.edad)))) {
      setError("Captura sexo y edad de cada asegurado.");
      return;
    }
    setResultados({});
    for (const p of PRODUCTOS_GMM) void cotizarUno(p.clave, valoresDe(p.clave));
  }

  function ajustar(p: ProductoGmm, clave: string, valor: string | number) {
    const aj = { ...ajustes, [p]: { ...ajustes[p], [clave]: valor } };
    setAjustes(aj);
    if (Object.keys(resultados).length) void cotizarUno(p, valoresDe(p, aj));
  }

  const hayResultados = Object.keys(resultados).length > 0;
  const ocupado = cargando.length > 0;
  const prima = (p: ProductoGmm) => {
    const r = resultados[p];
    return r && "prima" in r ? r.prima : undefined;
  };
  const columnas = [...PRODUCTOS_GMM.map((p) => p.clave)].sort(
    (a, b) => (prima(a)?.primaTotal ?? Infinity) - (prima(b)?.primaTotal ?? Infinity),
  );
  const mejor = columnas.find((p) => prima(p));
  const fraccionado = formaPago !== "ANUAL";

  const celdaDe = (p: ProductoGmm, clave: string) => {
    const c = camposDe(p).find((x) => x.clave === clave);
    return c ? mostrarValor(valoresDe(p)[clave], c.formato) : "—";
  };

  async function imprimir() {
    const { generarPdfGmmComparativo } = await import("@/lib/pdf-gmm-comparativo");
    await generarPdfGmmComparativo({
      agente,
      formaPago,
      asegurados: asegurados(),
      renglones: RENGLONES.map((r) => r.etiqueta),
      columnas: columnas
        .filter((p) => enPdf.includes(p) && prima(p))
        .map((p) => ({
          nombre: nombreDe(p),
          prima: prima(p)!,
          valores: RENGLONES.map((r) => celdaDe(p, r.clave)),
        })),
    });
  }

  const enPdfConPrima = columnas.filter((p) => enPdf.includes(p) && prima(p));

  return (
    <>
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-semibold text-slate-900">Cobertura a comparar</h2>
        <p className="mb-3 text-xs text-slate-500">
          Cada producto toma el valor más parecido de sus propias listas. Después puedes ajustarlo en cada columna.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select label="Suma asegurada" value={base.sa} opciones={BASE_SUMAS} onChange={(sa) => cambiarBase({ sa })} formato={formatMXN} />
          <Select label="Deducible" value={base.ded} opciones={BASE_DEDUCIBLES} onChange={(ded) => cambiarBase({ ded })} formato={formatMXN} />
          <Select label="Coaseguro" value={base.coa} opciones={BASE_COASEGUROS} onChange={(coa) => cambiarBase({ coa })} formato={(n) => `${Math.round(n * 100)}%`} />
          <Select label="Estado" value={base.estado} opciones={BASE_ESTADOS} onChange={(estado) => cambiarBase({ estado })} />
          <Select
            label="Forma de pago"
            value={formaPago}
            opciones={FORMAS_PAGO}
            onChange={(f) => {
              limpiar();
              setFormaPago(f);
            }}
          />
        </div>
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
              <input className={campo} type="number" min={0} max={100} placeholder="Edad" value={f.edad} onChange={(e) => cambiarFila(i, { edad: e.target.value })} />
              <button
                type="button"
                className="rounded-lg px-2 text-sm text-red-600 hover:bg-red-50 disabled:invisible"
                disabled={filas.length === 1}
                onClick={() => {
                  limpiar();
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
          disabled={filas.length >= MAX_FILAS}
          onClick={() => {
            limpiar();
            setFilas((fs) => [...fs, filaVacia(fs.length === 1 ? "Cónyuge" : "Hijo(a)")]);
          }}
        >
          + Agregar asegurado
        </button>
      </section>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="button"
        onClick={cotizar}
        disabled={ocupado || !listo}
        className="mb-6 rounded-lg bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
      >
        {!listo ? "Cargando…" : ocupado ? "Cotizando…" : "Comparar"}
      </button>

      {hayResultados && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Comparativo ({formaPago.toLowerCase()})</h2>
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              disabled={ocupado || enPdfConPrima.length === 0}
              onClick={() => void imprimir()}
            >
              Descargar PDF para el cliente
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-3" />
                  {columnas.map((p) => (
                    <th key={p} className="px-2 py-2 text-center font-semibold text-slate-900">
                      {nombreDe(p)}
                      <label className="mt-1 flex items-center justify-center gap-1 text-[11px] font-normal text-slate-500">
                        <input
                          type="checkbox"
                          checked={enPdf.includes(p)}
                          disabled={!prima(p)}
                          onChange={(e) => setEnPdf((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))}
                        />
                        En el PDF
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td className="py-2 pr-3 font-semibold text-slate-800">Prima total anual</td>
                  {columnas.map((p) => {
                    const r = resultados[p];
                    return (
                      <td key={p} className="px-2 py-2 text-center">
                        {cargando.includes(p) || !r ? (
                          <span className="text-xs text-slate-500">Cotizando…</span>
                        ) : "error" in r ? (
                          <span className="block text-xs text-rose-600">
                            <span className="font-semibold">No disponible.</span> {r.error}
                          </span>
                        ) : (
                          <span className={`text-lg font-bold ${p === mejor ? "text-emerald-700" : "text-sky-800"}`}>
                            {formatMXN(r.prima.primaTotal)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {fraccionado && (
                  <>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-700">Primer recibo</td>
                      {columnas.map((p) => (
                        <td key={p} className="px-2 py-2 text-center">
                          {prima(p) ? formatMXN(prima(p)!.primerRecibo) : "—"}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-700">Recibos subsecuentes</td>
                      {columnas.map((p) => (
                        <td key={p} className="px-2 py-2 text-center">
                          {prima(p) ? formatMXN(prima(p)!.subsecuentes) : "—"}
                        </td>
                      ))}
                    </tr>
                  </>
                )}
                {RENGLONES.map((r) => (
                  <tr key={r.clave} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700">{r.etiqueta}</td>
                    {columnas.map((p) => (
                      <td key={p} className="px-2 py-2 text-center text-slate-800">
                        {celdaDe(p, r.clave)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td />
                  {columnas.map((p) => (
                    <td key={p} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        className="text-xs font-semibold text-sky-700 hover:underline"
                        onClick={() => setEditando(editando === p ? null : p)}
                      >
                        {editando === p ? "Cerrar ajustes" : "Ajustar coberturas"}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {editando && (
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4">
              <h3 className="mb-1 font-semibold text-slate-900">Coberturas de {nombreDe(editando)}</h3>
              <p className="mb-3 text-xs text-slate-600">Al cambiar una opción se recotiza solo este producto.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {camposDe(editando)
                  .filter((c) => c.clave !== "cotizacion")
                  .map((c) => {
                    const v = valoresDe(editando)[c.clave];
                    return (
                      <Select
                        key={c.clave}
                        label={c.etiqueta}
                        value={c.opciones.find((o) => String(o) === String(v)) ?? c.opciones[0]}
                        opciones={c.opciones}
                        onChange={(o) => ajustar(editando, c.clave, o)}
                        formato={(o) => mostrarValor(o, c.formato)}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
