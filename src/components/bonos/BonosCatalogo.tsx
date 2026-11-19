"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgenteBono, ConfigBonos, Ramo, Reparto } from "@/lib/bonos/repositorio";
import { Mensajes, boton, botonSec, input, json, pct, pedir, tarjeta } from "./comun";

interface Catalogo {
  agentes: AgenteBono[];
  repartos: Reparto[];
  ramos: Ramo[];
  config: ConfigBonos;
  smtp: boolean;
}

const GRUPOS = ["AUTOS -DAÑOS", "VIDA - ACCI", "TRASPORTE", "SIN CLASIFICAR"];
const celda = "w-full rounded border border-slate-200 px-2 py-1 text-sm focus:border-sky-600 focus:outline-none";

export default function BonosCatalogo() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [filtro, setFiltro] = useState("");
  const [sub, setSub] = useState("GERARDO");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reparto, setReparto] = useState({ origenId: "", destinoId: "", porcentaje: "1" });
  const [config, setConfig] = useState<ConfigBonos | null>(null);

  const cargar = useCallback(() => {
    pedir<Catalogo>("/api/bonos/catalogo")
      .then((c) => {
        setCat(c);
        setConfig(c.config);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);

  async function guardar(body: unknown, mensaje?: string) {
    setError(null);
    setAviso(null);
    try {
      const c = await pedir<Catalogo>("/api/bonos/catalogo", json(body, "PATCH"));
      setCat(c);
      if (mensaje) {
        setConfig(c.config);
        setAviso(mensaje);
      }
    } catch (e) {
      setError((e as Error).message);
      cargar();
    }
  }

  async function agregarReparto(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await pedir<{ repartos: Reparto[] }>(
        "/api/bonos/repartos",
        json({ origenId: Number(reparto.origenId), destinoId: Number(reparto.destinoId), porcentaje: Number(reparto.porcentaje) / 100 }),
      );
      setCat((c) => (c ? { ...c, repartos: r.repartos } : c));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function quitarReparto(id: number) {
    const r = await pedir<{ repartos: Reparto[] }>(`/api/bonos/repartos?id=${id}`, { method: "DELETE" });
    setCat((c) => (c ? { ...c, repartos: r.repartos } : c));
  }

  async function subirCorreos(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("archivo", f);
    setError(null);
    try {
      const r = await pedir<{ actualizados: number; sinCoincidencia: string[] }>("/api/bonos/catalogo/correos", { method: "POST", body: fd });
      setAviso(
        `Correos actualizados: ${r.actualizados}.` +
          (r.sinCoincidencia.length ? `\nSin coincidencia: ${r.sinCoincidencia.join(", ")}` : ""),
      );
      cargar();
    } catch (err) {
      setError((err as Error).message);
    }
    e.target.value = "";
  }

  if (!cat || !config) return <Mensajes error={error} aviso={null} />;
  const subpromos = Array.from(new Set(["GERARDO", "INTERISK", "SIN ASIGNAR", ...cat.agentes.map((a) => a.subpromo)]));
  const visibles = cat.agentes.filter(
    (a) => (!sub || a.subpromo === sub) && (!filtro || `${a.nombre} ${a.claves.join(" ")} ${a.email ?? ""}`.toUpperCase().includes(filtro.toUpperCase())),
  );
  const gerardo = cat.agentes.filter((a) => a.subpromo === config.subpromo);
  const num = (k: keyof ConfigBonos, v: string) => setConfig({ ...config, [k]: Number(v) });

  return (
    <div className="space-y-6">
      <Mensajes error={error} aviso={aviso} />

      <section className={tarjeta}>
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-sm font-semibold text-slate-800">Agentes ({visibles.length})</h2>
          <label className="text-xs text-slate-600">
            Subpromotoría
            <select value={sub} onChange={(e) => setSub(e.target.value)} className={`${input} w-40`}>
              <option value="">Todas</option>
              {subpromos.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Buscar
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${input} w-56`} />
          </label>
          <label className={`${botonSec} cursor-pointer`} title="Excel con columnas CLAVE o AGENTE y CORREO">
            Importar correos (Excel)
            <input type="file" accept=".xlsx" onChange={subirCorreos} className="hidden" />
          </label>
        </div>
        <div className="mt-3 max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Agente</th>
                <th>Claves</th>
                <th className="w-36">Subpromotoría</th>
                <th className="w-20">% bono</th>
                <th className="w-64">Correo</th>
                <th className="w-16 text-center">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.map((a) => (
                <tr key={`${a.id}-${a.subpromo}-${a.porcentaje}-${a.email}`}>
                  <td className="py-1.5 pr-2">{a.nombre}</td>
                  <td className="pr-2 text-xs text-slate-500">{a.claves.join(", ")}</td>
                  <td className="pr-2">
                    <select defaultValue={a.subpromo} onChange={(e) => guardar({ agente: { id: a.id, subpromo: e.target.value } })} className={celda}>
                      {subpromos.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={+(a.porcentaje * 100).toFixed(4)}
                      onBlur={(e) => Number(e.target.value) / 100 !== a.porcentaje && guardar({ agente: { id: a.id, porcentaje: Number(e.target.value) / 100 } })}
                      className={celda}
                    />
                  </td>
                  <td className="pr-2">
                    <input
                      type="email"
                      defaultValue={a.email ?? ""}
                      onBlur={(e) => e.target.value.trim() !== (a.email ?? "") && guardar({ agente: { id: a.id, email: e.target.value } })}
                      className={celda}
                    />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" defaultChecked={a.activo} onChange={(e) => guardar({ agente: { id: a.id, activo: e.target.checked } })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">El % se captura como número: 1 = 1% de la prima computable.</p>
      </section>

      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Repartos entre agentes</h2>
        <p className="mt-1 text-xs text-slate-500">
          Parte del % de un agente se paga a otro. Ejemplo: Eloísa (2%) cede 1% a Pablo; Eloísa cobra 1% y Pablo recibe
          1% de la prima de Eloísa.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {cat.repartos.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span>
                <b>{r.origen}</b> cede {pct(r.porcentaje)} de su prima a <b>{r.destino}</b>
              </span>
              <button onClick={() => quitarReparto(r.id)} className="text-xs text-red-600 hover:underline">Quitar</button>
            </li>
          ))}
          {cat.repartos.length === 0 && <li className="text-slate-500">Sin repartos.</li>}
        </ul>
        <form onSubmit={agregarReparto} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_100px_auto] sm:items-end">
          <label className="text-xs text-slate-600">
            Agente que cede
            <select required value={reparto.origenId} onChange={(e) => setReparto({ ...reparto, origenId: e.target.value })} className={input}>
              <option value="" />
              {gerardo.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({pct(a.porcentaje)})</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Agente que recibe
            <select required value={reparto.destinoId} onChange={(e) => setReparto({ ...reparto, destinoId: e.target.value })} className={input}>
              <option value="" />
              {gerardo.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            % de la prima
            <input type="number" step="0.01" value={reparto.porcentaje} onChange={(e) => setReparto({ ...reparto, porcentaje: e.target.value })} className={input} />
          </label>
          <button className={boton}>Guardar reparto</button>
        </form>
      </section>

      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Ramos (subgrupos de El Potosí)</h2>
        <p className="mt-1 text-xs text-slate-500">% de bono de la promotoría por ramo. Los ramos con 0% no cuentan como prima computable.</p>
        <div className="mt-3 grid gap-x-6 gap-y-1 md:grid-cols-2">
          {cat.ramos.map((r) => (
            <div key={`${r.subgrupo}-${r.grupo}-${r.porcentaje}`} className="grid grid-cols-[1fr_140px_80px] items-center gap-2 text-sm">
              <span className={r.grupo === "SIN CLASIFICAR" ? "text-amber-700" : ""}>{r.subgrupo}</span>
              <select defaultValue={r.grupo} onChange={(e) => guardar({ ramo: { ...r, grupo: e.target.value } })} className={celda}>
                {GRUPOS.map((g) => <option key={g}>{g}</option>)}
              </select>
              <input
                type="number"
                step="0.1"
                defaultValue={+(r.porcentaje * 100).toFixed(4)}
                onBlur={(e) => Number(e.target.value) / 100 !== r.porcentaje && guardar({ ramo: { ...r, porcentaje: Number(e.target.value) / 100 } })}
                className={celda}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={tarjeta}>
        <h2 className="text-sm font-semibold text-slate-800">Parámetros</h2>
        {!cat.smtp && <p className="mt-1 text-xs text-amber-700">El servidor no tiene SMTP configurado: no se podrán enviar correos.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar({ config }, "Parámetros guardados.");
          }}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-xs text-slate-600">IVA (%)
            <input type="number" step="0.001" value={+(config.tasaIva * 100).toFixed(4)} onChange={(e) => num("tasaIva", String(Number(e.target.value) / 100))} className={input} />
          </label>
          <label className="text-xs text-slate-600">Retención ISR (%)
            <input type="number" step="0.001" value={+(config.retIsr * 100).toFixed(4)} onChange={(e) => num("retIsr", String(Number(e.target.value) / 100))} className={input} />
          </label>
          <label className="text-xs text-slate-600">Retención IVA (%)
            <input type="number" step="0.000001" value={+(config.retIva * 100).toFixed(6)} onChange={(e) => num("retIva", String(Number(e.target.value) / 100))} className={input} />
          </label>
          <label className="text-xs text-slate-600">Subpromotoría con reporte
            <input value={config.subpromo} onChange={(e) => setConfig({ ...config, subpromo: e.target.value.toUpperCase() })} className={input} />
          </label>
          <label className="text-xs text-slate-600">Nombre del promotor
            <input value={config.promotorNombre} onChange={(e) => setConfig({ ...config, promotorNombre: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-slate-600">Correo del promotor
            <input type="email" value={config.promotorEmail} onChange={(e) => setConfig({ ...config, promotorEmail: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-slate-600">Factor del promotor (%)
            <input type="number" step="0.1" value={+(config.factorPromotor * 100).toFixed(4)} onChange={(e) => num("factorPromotor", String(Number(e.target.value) / 100))} className={input} />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={config.promotorIva} onChange={(e) => setConfig({ ...config, promotorIva: e.target.checked })} />
            Promotor factura con IVA
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={config.promotorRetenciones} onChange={(e) => setConfig({ ...config, promotorRetenciones: e.target.checked })} />
            Promotor con retenciones ISR/IVA
          </label>
          <label className="text-xs text-slate-600">Copia de los correos a
            <input type="email" value={config.correoCopia} onChange={(e) => setConfig({ ...config, correoCopia: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">URL del portal (para los enlaces)
            <input placeholder="https://cotizador.interiskad.com" value={config.portalUrl} onChange={(e) => setConfig({ ...config, portalUrl: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-slate-600 sm:col-span-3">Datos para facturar (razón social, RFC, uso CFDI, régimen…)
            <textarea rows={4} value={config.datosFacturacion} onChange={(e) => setConfig({ ...config, datosFacturacion: e.target.value })} className={input} />
          </label>
          <div className="sm:col-span-3">
            <button className={boton}>Guardar parámetros</button>
          </div>
        </form>
      </section>
    </div>
  );
}
