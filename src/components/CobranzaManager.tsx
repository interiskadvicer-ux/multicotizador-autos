"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PolizaConEstado } from "@/lib/polizas";
import type { Coincidencia } from "@/lib/conciliacion";
import type { EstadoCuenta, Pago } from "@/lib/pagos";
import { formatMXN } from "@/lib/format";
import { RECIBOS_POR_FORMA } from "@/domain/admin";

const hoy = () => new Date().toLocaleDateString("en-CA");
const input =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-sky-500";

interface Fila extends Coincidencia {
  yaAplicado: boolean;
  elegida: boolean;
  monto: string;
  fechaPago: string;
}

// Con forma de pago fraccionada se propone el importe de un recibo.
function montoSugeridoManual(p: PolizaConEstado): number {
  const recibos = RECIBOS_POR_FORMA[p.formaPago ?? "ANUAL"] ?? 1;
  const base = p.saldo || p.primaTotal;
  return Math.round(Math.min(base, p.primaTotal / recibos) * 100) / 100;
}

export default function CobranzaManager({ esAdmin }: { esAdmin: boolean }) {
  const router = useRouter();
  const [polizas, setPolizas] = useState<PolizaConEstado[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [estados, setEstados] = useState<EstadoCuenta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [aseguradora, setAseguradora] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [conciliacion, setConciliacion] = useState<{
    estadoCuentaId: number;
    cargadoEl: string | null;
    sinTexto: boolean;
    polizasRevisadas: number;
    filas: Fila[];
  } | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const [manual, setManual] = useState({
    polizaId: "",
    monto: "",
    fechaPago: hoy(),
    referencia: "",
    recibo: "",
    notas: "",
  });
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [rp, rg, re] = await Promise.all([
      fetch("/api/polizas").then((r) => r.json()),
      fetch("/api/pagos").then((r) => r.json()),
      fetch("/api/cobranza/estados-cuenta").then((r) => r.json()),
    ]);
    setPolizas(rp.polizas ?? []);
    setPagos(rg.pagos ?? []);
    setEstados(rp.error ? [] : re.estadosCuenta ?? []);
  }

  useEffect(() => {
    cargar().catch(() => setError("No se pudo cargar la información."));
  }, []);

  const aseguradoras = useMemo(
    () => Array.from(new Set(polizas.map((p) => p.aseguradora))).sort(),
    [polizas],
  );
  const pendientes = polizas.filter((p) => p.estadoPago !== "PAGADA");
  const porCobrar = pendientes.reduce((s, p) => s + p.saldo, 0);

  async function leerEstadoCuenta(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setLeyendo(true);
    setError(null);
    setAviso(null);
    setConciliacion(null);
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("aseguradora", aseguradora);
    try {
      const res = await fetch("/api/cobranza/estados-cuenta", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el estado de cuenta.");
      setConciliacion({
        estadoCuentaId: data.estadoCuentaId,
        cargadoEl: data.cargadoEl,
        sinTexto: data.sinTexto,
        polizasRevisadas: data.polizasRevisadas,
        filas: (data.coincidencias as (Coincidencia & { yaAplicado: boolean })[]).map((c) => ({
          ...c,
          elegida: c.saldo > 0 && !c.yaAplicado,
          monto: String(c.montoSugerido),
          fechaPago: c.fechaDocumento ?? hoy(),
        })),
      });
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setLeyendo(false);
    }
  }

  function editarFila(i: number, cambios: Partial<Fila>) {
    setConciliacion((c) =>
      c ? { ...c, filas: c.filas.map((f, j) => (j === i ? { ...f, ...cambios } : f)) } : c,
    );
  }

  async function aplicar() {
    if (!conciliacion) return;
    const elegidas = conciliacion.filas.filter((f) => f.elegida && !f.yaAplicado);
    if (elegidas.length === 0) return;
    setAplicando(true);
    setError(null);
    const res = await fetch(`/api/cobranza/estados-cuenta/${conciliacion.estadoCuentaId}/aplicar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagos: elegidas.map((f) => ({
          polizaId: f.polizaId,
          monto: Number(f.monto),
          fechaPago: f.fechaPago,
          referencia: (archivo?.name ?? "").slice(0, 120) || null,
          recibo: f.recibo,
          notas: f.periodo ? `Periodo ${f.periodo}` : null,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setAplicando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudieron registrar los pagos.");
      return;
    }
    setAviso(
      `${data.aplicados} pago(s) registrado(s)` +
        (data.omitidos ? `; ${data.omitidos} ya estaban aplicados con este estado de cuenta.` : "."),
    );
    setConciliacion(null);
    setArchivo(null);
    cargar();
    // Invalida la caché del router para que el dashboard muestre lo cobrado.
    router.refresh();
  }

  async function registrarManual(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    const res = await fetch("/api/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manual, polizaId: Number(manual.polizaId), monto: Number(manual.monto) }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo registrar el pago.");
      return;
    }
    setAviso("Pago registrado.");
    setManual({ polizaId: "", monto: "", fechaPago: hoy(), referencia: "", recibo: "", notas: "" });
    cargar();
    router.refresh();
  }

  async function eliminar(p: Pago) {
    if (!window.confirm(`¿Eliminar el pago de ${formatMXN(p.monto)} de la póliza ${p.numeroPoliza}?`)) return;
    const res = await fetch(`/api/pagos/${p.id}`, { method: "DELETE" });
    if (!res.ok) setError("No se pudo eliminar el pago.");
    cargar();
    router.refresh();
  }

  const polizaManual = polizas.find((p) => p.id === Number(manual.polizaId));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pólizas por cobrar</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{pendientes.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Saldo por cobrar</div>
          <div className="mt-2 text-2xl font-bold text-red-600">{formatMXN(porCobrar)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Pólizas pagadas</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {polizas.length - pendientes.length}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {aviso && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{aviso}</div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Cargar estado de cuenta de aseguradora</h2>
        <p className="mt-1 text-xs text-slate-500">
          Se buscan en el archivo los números de póliza registrados. Revisa las coincidencias y confirma
          cuáles se dan por pagadas.
        </p>
        <form onSubmit={leerEstadoCuenta} className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="text-xs text-slate-600">
            Aseguradora
            <select value={aseguradora} onChange={(e) => setAseguradora(e.target.value)} className={input}>
              <option value="">Todas</option>
              {aseguradoras.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Estado de cuenta (PDF, CSV o Excel)
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className={input}
            />
          </label>
          <button
            type="submit"
            disabled={!archivo || leyendo}
            className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {leyendo ? "Leyendo…" : "Leer estado de cuenta"}
          </button>
        </form>

        {conciliacion && (
          <div className="mt-5">
            {conciliacion.cargadoEl && (
              <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                Este estado de cuenta ya se había cargado el {conciliacion.cargadoEl.slice(0, 10)}. Las
                pólizas que ya se pagaron con él aparecen como &quot;Ya aplicado&quot; y no se pueden volver a
                registrar.
              </div>
            )}
            {conciliacion.sinTexto ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                El archivo no contiene texto (si es PDF, parece escaneado). Pide a la aseguradora el estado de cuenta
                electrónico o registra los pagos manualmente.
              </div>
            ) : conciliacion.filas.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                No se encontró ninguna de las {conciliacion.polizasRevisadas} pólizas registradas en este
                estado de cuenta.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2"></th>
                        <th className="px-3 py-2">Póliza</th>
                        <th className="px-3 py-2">Asegurado</th>
                        <th className="px-3 py-2 text-right">Prima total</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2">Monto pagado</th>
                        <th className="px-3 py-2">Fecha de pago</th>
                        <th className="px-3 py-2">En el estado de cuenta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {conciliacion.filas.map((f, i) => (
                        <tr key={`${f.polizaId}-${f.recibo ?? i}`}>
                          <td className="px-3 py-2">
                            {f.yaAplicado ? (
                              <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                Ya aplicado
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={f.elegida}
                                onChange={(e) => editarFila(i, { elegida: e.target.checked })}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {f.numeroPoliza}
                            <div className="text-xs font-normal text-slate-500">{f.aseguradora}</div>
                            {f.recibo && (
                              <div className="text-xs font-normal text-sky-700">Recibo {f.recibo}</div>
                            )}
                            {f.periodo && (
                              <div className="text-xs font-normal text-slate-500">{f.periodo}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{f.asegurado}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatMXN(f.primaTotal)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {f.saldo > 0 ? formatMXN(f.saldo) : <span className="text-emerald-700">Pagada</span>}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={f.monto}
                              onChange={(e) => editarFila(i, { monto: e.target.value })}
                              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={f.fechaPago}
                              onChange={(e) => editarFila(i, { fechaPago: e.target.value })}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="max-w-xs px-3 py-2 text-xs">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 font-medium ${
                                f.importeCoincide ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {f.importeCoincide ? "Importe coincide" : "Verifica el importe"}
                            </span>
                            <div className="mt-1 truncate font-mono text-slate-500" title={f.linea}>
                              {f.linea}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {conciliacion.filas.length} {conciliacion.filas.length === 1 ? "pago" : "pagos"} de{" "}
                    {new Set(conciliacion.filas.map((f) => f.polizaId)).size} de{" "}
                    {conciliacion.polizasRevisadas} pólizas encontrados en el archivo.
                  </span>
                  <button
                    type="button"
                    onClick={aplicar}
                    disabled={aplicando || !conciliacion.filas.some((f) => f.elegida && !f.yaAplicado)}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {aplicando ? "Registrando…" : "Dar por pagadas las seleccionadas"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Registrar pago manual</h2>
        <form onSubmit={registrarManual} className="mt-4 grid gap-3 sm:grid-cols-6 sm:items-end">
          <label className="text-xs text-slate-600 sm:col-span-2">
            Póliza
            <select
              required
              value={manual.polizaId}
              onChange={(e) => {
                const p = polizas.find((x) => x.id === Number(e.target.value));
                setManual({ ...manual, polizaId: e.target.value, monto: p ? String(montoSugeridoManual(p)) : "" });
              }}
              className={input}
            >
              <option value="">Selecciona…</option>
              {polizas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numeroPoliza} · {p.asegurado} · {p.aseguradora}
                  {p.estadoPago === "PAGADA" ? " (pagada)" : ` (saldo ${formatMXN(p.saldo)})`}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Monto
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              value={manual.monto}
              onChange={(e) => setManual({ ...manual, monto: e.target.value })}
              className={input}
            />
          </label>
          <label className="text-xs text-slate-600">
            Fecha de pago
            <input
              required
              type="date"
              value={manual.fechaPago}
              onChange={(e) => setManual({ ...manual, fechaPago: e.target.value })}
              className={input}
            />
          </label>
          <label className="text-xs text-slate-600">
            Referencia
            <input
              value={manual.referencia}
              onChange={(e) => setManual({ ...manual, referencia: e.target.value })}
              placeholder="Folio, transferencia…"
              className={input}
            />
          </label>
          <label className="text-xs text-slate-600">
            No. de recibo
            <input
              value={manual.recibo}
              onChange={(e) => setManual({ ...manual, recibo: e.target.value })}
              placeholder="Opcional"
              className={input}
            />
          </label>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Registrar pago"}
          </button>
          {polizaManual && (
            <p className="text-xs text-slate-500 sm:col-span-6">
              Prima total {formatMXN(polizaManual.primaTotal)} · pagado {formatMXN(polizaManual.pagado)} · saldo{" "}
              {formatMXN(polizaManual.saldo)}
            </p>
          )}
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Pagos registrados</h2>
        {pagos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay pagos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Póliza</th>
                  <th className="px-3 py-2">Asegurado</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Referencia</th>
                  {esAdmin && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-slate-600">{p.fechaPago}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {p.numeroPoliza}
                      <div className="text-xs font-normal text-slate-500">{p.aseguradora}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.asegurado}</td>
                    <td className="px-3 py-2 text-right font-medium text-slate-800">{formatMXN(p.monto)}</td>
                    <td className="px-3 py-2 text-xs">
                      {p.origen === "ESTADO_CUENTA" ? (
                        <a
                          href={`/api/cobranza/estados-cuenta/${p.statementId}/archivo`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 hover:underline"
                        >
                          Estado de cuenta
                        </a>
                      ) : p.origen === "WS_ASEGURADORA" ? (
                        <span className="text-slate-600">Aseguradora (automático)</span>
                      ) : (
                        <span className="text-slate-600">Manual</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {p.recibo && <div className="font-medium text-slate-700">Recibo {p.recibo}</div>}
                      {p.referencia ?? (p.recibo ? null : "—")}
                    </td>
                    {esAdmin && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => eliminar(p)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {estados.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Estados de cuenta cargados</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {estados.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <a
                  href={`/api/cobranza/estados-cuenta/${s.id}/archivo`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-sky-700 hover:underline"
                >
                  {s.nombreOriginal}
                </a>
                <span className="shrink-0 text-xs text-slate-500">
                  {s.aseguradora || "Todas"} · {s.createdAt.slice(0, 10)} · {s.pagosAplicados} pagos ·{" "}
                  {formatMXN(s.montoAplicado)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
