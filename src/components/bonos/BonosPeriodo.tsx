"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMXN } from "@/lib/format";
import type { ResultadoAgente, ResultadoPromotor } from "@/lib/bonos/calculo";
import type { ReporteBono, TipoReporte } from "@/lib/bonos/repositorio";
import { BIMESTRES, MESES, Mensajes, boton, botonSec, input, json, pct, pedir, tarjeta } from "./comun";

interface Datos {
  etiqueta: string;
  reportes: ReporteBono[];
  mesesCargados?: number[];
  resultados?: ResultadoAgente[];
  cargado?: boolean;
  resultado?: ResultadoPromotor;
  generacion?: { creados: number; actualizados: number; bloqueados: string[] };
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  GENERADO: { texto: "Generado", clase: "bg-slate-100 text-slate-700" },
  ENVIADO: { texto: "Enviado", clase: "bg-sky-100 text-sky-800" },
  FACTURADO: { texto: "Facturado", clase: "bg-amber-100 text-amber-800" },
  PAGADO: { texto: "Pagado", clase: "bg-emerald-100 text-emerald-800" },
};

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BonosPeriodo({ tipo }: { tipo: TipoReporte }) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const [anio, setAnio] = useState(d.getFullYear());
  const [periodo, setPeriodo] = useState(tipo === "AGENTE" ? Math.ceil((d.getMonth() + 1) / 2) : d.getMonth() + 1);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const qs = `tipo=${tipo}&anio=${anio}&periodo=${periodo}`;

  const cargar = useCallback(() => {
    setError(null);
    pedir<Datos>(`/api/bonos/periodo?${qs}`).then(setDatos).catch((e) => setError(e.message));
  }, [qs]);
  useEffect(() => {
    setSeleccion(new Set());
    setAviso(null);
    cargar();
  }, [cargar]);

  async function accion<T>(fn: () => Promise<T>, exito: (r: T) => string | null) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      setAviso(exito(await fn()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const generar = () =>
    accion(
      () => pedir<Datos>("/api/bonos/periodo", json({ tipo, anio, periodo })),
      (r) => {
        setDatos(r);
        const g = r.generacion!;
        const partes = [`Reportes generados: ${g.creados} nuevos, ${g.actualizados} actualizados.`];
        if (g.bloqueados.length) partes.push(`No se cambiaron porque ya tienen factura o pago: ${g.bloqueados.join(", ")}.`);
        return partes.join("\n");
      },
    );

  const enviar = () => {
    const ids = Array.from(seleccion);
    if (!ids.length || !window.confirm(`¿Enviar ${ids.length} correo(s)?`)) return;
    accion(
      () => pedir<{ enviados: string[]; errores: string[] }>("/api/bonos/enviar", json({ ids })),
      (r) => {
        setSeleccion(new Set());
        cargar();
        return [`Correos enviados: ${r.enviados.length}.`, ...r.errores].join("\n");
      },
    );
  };

  const pagar = (r: ReporteBono) => {
    const fecha = window.prompt(`Fecha de pago de ${r.nombre} (AAAA-MM-DD)`, hoy());
    if (!fecha) return;
    const referencia = window.prompt("Referencia de la transferencia (opcional)", "") ?? "";
    accion(() => pedir(`/api/bonos/reportes/${r.id}`, json({ accion: "pagar", fechaPago: fecha, referencia }, "PATCH")), () => {
      cargar();
      return `Pago de ${r.nombre} registrado.`;
    });
  };

  const revertir = (r: ReporteBono) => {
    if (!window.confirm(`¿Quitar la marca de pagado a ${r.nombre}?`)) return;
    accion(() => pedir(`/api/bonos/reportes/${r.id}`, json({ accion: "revertir" }, "PATCH")), () => {
      cargar();
      return null;
    });
  };

  const reportes = datos?.reportes ?? [];
  const porAgente = new Map(reportes.map((r) => [r.agenteId ?? 0, r]));
  const alternar = (id: number) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pendientesEnvio = reportes.filter((r) => r.estado === "GENERADO");

  const faltanMeses =
    tipo === "AGENTE" ? datos?.mesesCargados && datos.mesesCargados.length < 2 : datos && !datos.cargado;

  return (
    <div className="space-y-6">
      <section className={`${tarjeta} flex flex-wrap items-end gap-3`}>
        <label className="text-xs text-slate-600">
          Año
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={`${input} w-28`} />
        </label>
        <label className="text-xs text-slate-600">
          {tipo === "AGENTE" ? "Bimestre" : "Mes"}
          <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} className={`${input} w-48`}>
            {(tipo === "AGENTE" ? BIMESTRES : MESES).map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <button onClick={generar} disabled={ocupado} className={boton}>
          {reportes.length ? "Recalcular reportes" : "Generar reportes"}
        </button>
        <button
          onClick={enviar}
          disabled={ocupado || seleccion.size === 0}
          className={botonSec}
          title="Envía el correo con las cifras y el enlace para subir factura"
        >
          Enviar correo ({seleccion.size})
        </button>
        {pendientesEnvio.length > 0 && (
          <button onClick={() => setSeleccion(new Set(pendientesEnvio.map((r) => r.id)))} className={botonSec}>
            Seleccionar no enviados ({pendientesEnvio.length})
          </button>
        )}
        <a href={`/api/bonos/periodo/excel?${qs}`} className={botonSec}>Descargar Excel</a>
      </section>

      <Mensajes error={error} aviso={aviso} />
      {faltanMeses && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {tipo === "AGENTE"
            ? `Solo hay ${datos?.mesesCargados?.length ?? 0} de 2 meses cargados para este bimestre.`
            : "Este mes no tiene producción cargada."}
        </div>
      )}

      {datos && tipo === "AGENTE" && datos.resultados && (
        <TablaAgentes
          etiqueta={datos.etiqueta}
          resultados={datos.resultados}
          porAgente={porAgente}
          seleccion={seleccion}
          alternar={alternar}
          pagar={pagar}
          revertir={revertir}
        />
      )}
      {datos && tipo === "PROMOTOR" && datos.resultado && (
        <TablaPromotor
          etiqueta={datos.etiqueta}
          r={datos.resultado}
          reporte={reportes[0]}
          seleccion={seleccion}
          alternar={alternar}
          pagar={pagar}
          revertir={revertir}
        />
      )}
    </div>
  );
}

interface AccionesProps {
  seleccion: Set<number>;
  alternar: (id: number) => void;
  pagar: (r: ReporteBono) => void;
  revertir: (r: ReporteBono) => void;
}

function EstadoReporte({
  r, calculado, pagar, revertir,
}: { r?: ReporteBono; calculado: number } & Pick<AccionesProps, "pagar" | "revertir">) {
  if (!r) return <span className="text-xs text-slate-400">Sin reporte</span>;
  const e = ETIQUETA_ESTADO[r.estado];
  const cambio = Math.abs(r.total - calculado) > 0.005;
  const difiere = r.facturaTotal !== null && Math.abs(r.facturaTotal - r.total) > 0.5;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={`rounded-full px-2 py-0.5 font-medium ${e.clase}`}>{e.texto}</span>
      {cambio && (
        <span className="font-semibold text-amber-700" title="Importe guardado en el reporte; difiere del cálculo actual">
          Reporte {formatMXN(r.total)}
        </span>
      )}
      {r.facturaPdf && (
        <>
          <a href={`/api/bonos/reportes/${r.id}?archivo=pdf`} target="_blank" className="text-sky-700 hover:underline">PDF</a>
          <a href={`/api/bonos/reportes/${r.id}?archivo=xml`} target="_blank" className="text-sky-700 hover:underline">XML</a>
        </>
      )}
      {difiere && <span className="text-red-600" title="Total del XML">XML {formatMXN(r.facturaTotal!)}</span>}
      {r.estado === "PAGADO" ? (
        <button onClick={() => revertir(r)} className="text-slate-500 hover:underline" title={r.referenciaPago ?? ""}>
          {r.fechaPago} ↺
        </button>
      ) : (
        <button onClick={() => pagar(r)} className="text-emerald-700 hover:underline">Marcar pagado</button>
      )}
    </div>
  );
}

function TablaAgentes({
  etiqueta, resultados, porAgente, seleccion, alternar, pagar, revertir,
}: { etiqueta: string; resultados: ResultadoAgente[]; porAgente: Map<number, ReporteBono> } & AccionesProps) {
  const suma = (k: keyof ResultadoAgente) => resultados.reduce((s, r) => s + (r[k] as number), 0);
  const visibles = resultados.filter((r) => r.base !== 0 || porAgente.has(r.agenteId));
  return (
    <section className={tarjeta}>
      <h2 className="text-sm font-semibold text-slate-800">Cifras {etiqueta}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th />
              <th className="py-2">Agente</th>
              <th className="text-right">Prima computable</th>
              <th className="text-right">%</th>
              <th className="text-right">Bono</th>
              <th className="text-right">IVA</th>
              <th className="text-right">Ret ISR</th>
              <th className="text-right">Ret IVA</th>
              <th className="text-right">Total factura</th>
              <th className="pl-4">Correo / estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((r) => {
              const rep = porAgente.get(r.agenteId);
              return (
                <tr key={r.agenteId} className={r.total <= 0 ? "text-slate-400" : ""}>
                  <td className="pr-2">
                    {rep && rep.estado !== "PAGADO" && (
                      <input type="checkbox" checked={seleccion.has(rep.id)} onChange={() => alternar(rep.id)} />
                    )}
                  </td>
                  <td className="py-2">
                    <div className="font-medium">{r.nombre}</div>
                    {[...r.recibe.map((x) => `+${pct(x.porcentaje)} de ${x.nombre} (${formatMXN(x.importe)})`),
                      ...r.cede.map((x) => `−${pct(x.porcentaje)} a ${x.nombre} (${formatMXN(x.importe)})`)].map((t) => (
                      <div key={t} className="text-xs text-violet-700">{t}</div>
                    ))}
                  </td>
                  <td className="text-right tabular-nums">{formatMXN(r.base)}</td>
                  <td className="text-right tabular-nums">{pct(r.porcentaje)}</td>
                  <td className="text-right tabular-nums">{formatMXN(r.bono)}</td>
                  <td className="text-right tabular-nums">{formatMXN(r.iva)}</td>
                  <td className="text-right tabular-nums">{formatMXN(r.retIsr)}</td>
                  <td className="text-right tabular-nums">{formatMXN(r.retIva)}</td>
                  <td className="text-right font-semibold tabular-nums">{formatMXN(r.total)}</td>
                  <td className="pl-4">
                    <div className="text-xs text-slate-500">{rep?.email ?? (rep ? "sin correo" : "")}</div>
                    {(rep || r.total > 0) && <EstadoReporte r={rep} calculado={r.total} pagar={pagar} revertir={revertir} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-semibold">
            <tr>
              <td />
              <td className="py-2">TOTAL</td>
              <td className="text-right tabular-nums">{formatMXN(suma("base"))}</td>
              <td />
              <td className="text-right tabular-nums">{formatMXN(suma("bono"))}</td>
              <td className="text-right tabular-nums">{formatMXN(suma("iva"))}</td>
              <td className="text-right tabular-nums">{formatMXN(suma("retIsr"))}</td>
              <td className="text-right tabular-nums">{formatMXN(suma("retIva"))}</td>
              <td className="text-right tabular-nums">{formatMXN(suma("total"))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Se generan reportes solo para agentes con total a facturar mayor a cero.
      </p>
    </section>
  );
}

function TablaPromotor({
  etiqueta, r, reporte, seleccion, alternar, pagar, revertir,
}: { etiqueta: string; r: ResultadoPromotor; reporte?: ReporteBono } & AccionesProps) {
  const t = r.totales;
  const visibles = r.filas.filter((f) => f.primaAutosDanos || f.primaVida || f.primaTransporte);
  const resumen: [string, string][] = [
    ["Total bono sin agentes", formatMXN(t.totalSinAgente)],
    ["Ponderado", String(r.ponderado)],
    ["Subtotal × ponderado", formatMXN(r.subtotal)],
    ["Factor", pct(r.factor)],
    ["Bono", formatMXN(r.bono)],
    ["IVA", formatMXN(r.iva)],
    ["Retención ISR", formatMXN(r.retIsr)],
    ["Retención IVA", formatMXN(r.retIva)],
    ["Total a facturar", formatMXN(r.total)],
  ];
  return (
    <div className="space-y-6">
      <section className={`${tarjeta} grid gap-6 lg:grid-cols-[1fr_320px]`}>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Bono del promotor · {etiqueta}</h2>
          <table className="mt-3 w-full max-w-md text-sm">
            <tbody>
              {resumen.map(([k, v], i) => (
                <tr key={k} className={i === resumen.length - 1 ? "border-t-2 border-sky-700 font-bold" : ""}>
                  <td className="py-1 text-slate-600">{k}</td>
                  <td className="py-1 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Reporte</div>
          {reporte ? (
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                {reporte.estado !== "PAGADO" && (
                  <input type="checkbox" checked={seleccion.has(reporte.id)} onChange={() => alternar(reporte.id)} />
                )}
                {reporte.nombre}
              </label>
              <div className="text-xs text-slate-500">{reporte.email ?? "Sin correo (configúralo en Catálogo)"}</div>
              <EstadoReporte r={reporte} calculado={r.total} pagar={pagar} revertir={revertir} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Genera el reporte para enviarlo y controlar su factura.</p>
          )}
        </div>
      </section>
      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Detalle por agente</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Agente</th>
                <th className="text-right">Prima Autos/Daños</th>
                <th className="text-right">Bono 100%</th>
                <th className="text-right">% agente</th>
                <th className="text-right">Bono agente</th>
                <th className="text-right">Diferencia</th>
                <th className="text-right">Prima Vida/Acc</th>
                <th className="text-right">Bono Vida/Acc</th>
                <th className="text-right">Prima Transporte</th>
                <th className="text-right">Bono Transporte</th>
                <th className="text-right">Total sin agente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((f) => (
                <tr key={f.agenteId}>
                  <td className="py-1.5">{f.nombre}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.primaAutosDanos)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.bonoAutosDanos)}</td>
                  <td className="text-right tabular-nums">{pct(f.porcentajeAgente)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.bonoAgente)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.diferencia)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.primaVida)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.bonoVida)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.primaTransporte)}</td>
                  <td className="text-right tabular-nums">{formatMXN(f.bonoTransporte)}</td>
                  <td className="text-right font-semibold tabular-nums">{formatMXN(f.totalSinAgente)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 font-semibold">
              <tr>
                <td className="py-2">TOTAL</td>
                <td className="text-right tabular-nums">{formatMXN(t.primaAutosDanos)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.bonoAutosDanos)}</td>
                <td />
                <td className="text-right tabular-nums">{formatMXN(t.bonoAgente)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.diferencia)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.primaVida)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.bonoVida)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.primaTransporte)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.bonoTransporte)}</td>
                <td className="text-right tabular-nums">{formatMXN(t.totalSinAgente)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
