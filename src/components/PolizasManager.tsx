"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ESTATUS_PAGO,
  RAMOS,
  esAseguradoraAfirme,
  numeroPolizaAfirmeValido,
  type EstatusPago,
  type OrigenPago,
  type Poliza,
  type ReciboGuardado,
} from "@/domain/admin";
import type { EstadoVigencia } from "@/lib/polizas";
import { formatMXN } from "@/lib/format";

type PolizaConEstado = Poliza & {
  estado: EstadoVigencia;
  diasParaVencer: number;
};

const ESTADO_META: Record<
  EstadoVigencia,
  { label: string; cls: string }
> = {
  VIGENTE: { label: "Vigente", cls: "bg-emerald-50 text-emerald-700" },
  PROXIMA: { label: "Próxima (≤60 d)", cls: "bg-amber-50 text-amber-700" },
  POR_VENCER: { label: "Por vencer (≤30 d)", cls: "bg-orange-50 text-orange-700" },
  VENCIDA: { label: "Vencida", cls: "bg-red-50 text-red-700" },
};

const PAGO_META: Record<EstatusPago, { label: string; cls: string }> = {
  PAGADA: { label: "Pagada", cls: "bg-emerald-50 text-emerald-700" },
  PENDIENTE: { label: "Pendiente", cls: "bg-amber-50 text-amber-700" },
  CANCELADA: { label: "Cancelada", cls: "bg-slate-100 text-slate-600" },
};

const ORIGEN_LABEL: Record<OrigenPago, string> = {
  AFIRME: "Real Afirme",
  MANUAL: "Manual",
};

const SITUACION_RECIBO: Record<ReciboGuardado["situacion"], string> = {
  EMITIDO: "Pendiente",
  PAGADO: "Pagado",
  CANCELADO: "Cancelado",
};

type FiltroPago = "" | EstatusPago | "SIN_DATO";

interface ConsultaAfirme {
  poliza: {
    asegurado: string | null;
    vigenciaInicio: string | null;
    vigenciaFin: string | null;
    vehiculo: string | null;
    numeroSerie: string | null;
    estatusPoliza: string | null;
  };
  estatusPago: EstatusPago | null;
  primaNeta: number | null;
  primaTotal: number | null;
}

interface ResultadoPagos {
  consultadas: number;
  actualizadas: { numeroPoliza: string }[];
  errores: { numeroPoliza: string; error: string }[];
}

interface FormState {
  id: number | null;
  numeroPoliza: string;
  ramo: string;
  aseguradora: string;
  asegurado: string;
  primaNeta: string;
  primaTotal: string;
  vigenciaInicio: string;
  vigenciaFin: string;
  notas: string;
  vehiculo: string;
  numeroSerie: string;
  estatusPago: EstatusPago | "";
}

const FORM_VACIO: FormState = {
  id: null,
  numeroPoliza: "",
  ramo: "Autos",
  aseguradora: "",
  asegurado: "",
  primaNeta: "",
  primaTotal: "",
  vigenciaInicio: "",
  vigenciaFin: "",
  notas: "",
  vehiculo: "",
  numeroSerie: "",
  estatusPago: "",
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

export default function PolizasManager() {
  const [polizas, setPolizas] = useState<PolizaConEstado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState<"TODAS" | "VENCIMIENTOS">("TODAS");
  const [filtroPago, setFiltroPago] = useState<FiltroPago>("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [actualizandoPagos, setActualizandoPagos] = useState(false);
  const [consultandoAfirme, setConsultandoAfirme] = useState(false);
  const [avisoAfirme, setAvisoAfirme] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [recibos, setRecibos] = useState<ReciboGuardado[] | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/polizas");
      if (!res.ok) throw new Error("No se pudieron cargar las pólizas.");
      const data = await res.json();
      setPolizas(data.polizas as PolizaConEstado[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  const vencimientos = useMemo(
    () => polizas.filter((p) => p.estado !== "VIGENTE"),
    [polizas],
  );

  const visibles = (filtro === "TODAS" ? polizas : vencimientos).filter(
    (p) =>
      !filtroPago ||
      (filtroPago === "SIN_DATO"
        ? !p.estatusPago
        : p.estatusPago === filtroPago),
  );

  const hayAfirme = polizas.some((p) => esAseguradoraAfirme(p.aseguradora));

  function abrirNueva() {
    setAvisoAfirme(null);
    setForm({ ...FORM_VACIO });
  }

  async function traerDeAfirme(actual: FormState) {
    const numero = actual.numeroPoliza.trim();
    if (!numeroPolizaAfirmeValido(numero)) {
      setAvisoAfirme("Formato de póliza Afirme: 3401-117764-00.");
      return;
    }
    setConsultandoAfirme(true);
    setAvisoAfirme(null);
    try {
      const res = await fetch(
        `/api/polizas/afirme?numero=${encodeURIComponent(numero)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo consultar Afirme.");
      }
      const c = data as ConsultaAfirme;
      setForm((f) =>
        f
          ? {
              ...f,
              numeroPoliza: numero,
              aseguradora: f.aseguradora || "Afirme",
              ramo: f.ramo || "Autos",
              asegurado: c.poliza.asegurado ?? f.asegurado,
              vigenciaInicio: c.poliza.vigenciaInicio ?? f.vigenciaInicio,
              vigenciaFin: c.poliza.vigenciaFin ?? f.vigenciaFin,
              vehiculo: c.poliza.vehiculo ?? f.vehiculo,
              numeroSerie: c.poliza.numeroSerie ?? f.numeroSerie,
              primaNeta:
                c.primaNeta !== null ? String(c.primaNeta) : f.primaNeta,
              primaTotal:
                c.primaTotal !== null ? String(c.primaTotal) : f.primaTotal,
              estatusPago: c.estatusPago ?? f.estatusPago,
            }
          : f,
      );
      const faltan = [
        !c.poliza.asegurado && "asegurado",
        !c.poliza.vehiculo && "vehículo",
      ].filter(Boolean);
      setAvisoAfirme(
        `Datos traídos de Afirme${
          c.poliza.estatusPoliza ? ` (póliza ${c.poliza.estatusPoliza})` : ""
        }.${
          faltan.length
            ? ` Afirme no devolvió ${faltan.join(" ni ")} (común en flotillas): captúralo a mano.`
            : ""
        }`,
      );
    } catch (err) {
      setAvisoAfirme(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setConsultandoAfirme(false);
    }
  }

  async function actualizarPagos(ids?: number[]): Promise<ResultadoPagos | null> {
    setActualizandoPagos(true);
    setError(null);
    try {
      const res = await fetch("/api/polizas/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudieron actualizar los pagos.");
      return data as ResultadoPagos;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
      return null;
    } finally {
      setActualizandoPagos(false);
    }
  }

  async function actualizarTodosLosPagos() {
    setAviso(null);
    const r = await actualizarPagos();
    if (!r) return;
    setAviso(
      `Pagos Afirme: ${r.actualizadas.length} de ${r.consultadas} póliza(s) actualizadas.` +
        (r.errores.length
          ? ` Con error: ${r.errores
              .map((e) => `${e.numeroPoliza} (${e.error})`)
              .join("; ")}`
          : ""),
    );
    setAbierta(null);
    await cargar();
  }

  async function verRecibos(p: PolizaConEstado) {
    if (abierta === p.id) {
      setAbierta(null);
      return;
    }
    setAbierta(p.id);
    setRecibos(null);
    const res = await fetch(`/api/polizas/${p.id}/recibos`);
    const data = await res.json().catch(() => ({}));
    setRecibos(res.ok ? (data.recibos as ReciboGuardado[]) : []);
  }

  function abrirEdicion(p: PolizaConEstado) {
    setForm({
      id: p.id,
      numeroPoliza: p.numeroPoliza,
      ramo: p.ramo,
      aseguradora: p.aseguradora,
      asegurado: p.asegurado,
      primaNeta: String(p.primaNeta),
      primaTotal: String(p.primaTotal),
      vigenciaInicio: p.vigenciaInicio,
      vigenciaFin: p.vigenciaFin,
      notas: p.notas ?? "",
      vehiculo: p.vehiculo ?? "",
      numeroSerie: p.numeroSerie ?? "",
      estatusPago: p.estatusPago ?? "",
    });
    setAvisoAfirme(null);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setGuardando(true);
    setError(null);
    const payload = {
      numeroPoliza: form.numeroPoliza,
      ramo: form.ramo,
      aseguradora: form.aseguradora,
      asegurado: form.asegurado,
      primaNeta: Number(form.primaNeta),
      primaTotal: Number(form.primaTotal),
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFin: form.vigenciaFin,
      notas: form.notas || undefined,
      vehiculo: form.vehiculo || undefined,
      numeroSerie: form.numeroSerie || undefined,
      estatusPago: form.estatusPago || null,
    };
    try {
      const res = await fetch(
        form.id ? `/api/polizas/${form.id}` : "/api/polizas",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo guardar la póliza.");
      }
      const { poliza } = (await res.json()) as { poliza: Poliza };
      setForm(null);
      // Al dar de alta una póliza Afirme se guardan sus recibos reales.
      if (!form.id && esAseguradoraAfirme(poliza.aseguradora)) {
        const r = await actualizarPagos([poliza.id]);
        if (r?.errores.length) {
          setAviso(`No se pudieron traer los recibos de Afirme: ${r.errores[0].error}`);
        }
      }
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(p: PolizaConEstado) {
    if (!confirm(`¿Eliminar la póliza ${p.numeroPoliza}?`)) return;
    try {
      const res = await fetch(`/api/polizas/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar la póliza.");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setFiltro("TODAS")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filtro === "TODAS"
                ? "bg-sky-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Todas ({polizas.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro("VENCIMIENTOS")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filtro === "VENCIMIENTOS"
                ? "bg-sky-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Vencimientos ({vencimientos.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por estatus de pago"
            value={filtroPago}
            onChange={(e) => setFiltroPago(e.target.value as FiltroPago)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <option value="">Pago: todos</option>
            {ESTATUS_PAGO.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
            <option value="SIN_DATO">Sin dato de pago</option>
          </select>
          {hayAfirme && (
            <button
              type="button"
              onClick={actualizarTodosLosPagos}
              disabled={actualizandoPagos}
              className="rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
            >
              {actualizandoPagos ? "Consultando Afirme…" : "Actualizar pagos"}
            </button>
          )}
          <a
            href={`/api/polizas/export?tipo=pagos${
              filtroPago ? `&estatus=${filtroPago}` : ""
            }`}
            className="rounded-xl border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Excel de pagos
          </a>
          <a
            href={`/api/polizas/export${
              filtro === "VENCIMIENTOS" ? "?tipo=vencimientos" : ""
            }`}
            className="rounded-xl border border-emerald-600 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Descargar Excel
          </a>
          <button
            type="button"
            onClick={abrirNueva}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            + Nueva póliza
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {aviso && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          {aviso}
        </div>
      )}

      {form && (
        <form
          onSubmit={guardar}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">
            {form.id ? "Editar póliza" : "Nueva póliza"}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>No. de póliza</label>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={form.numeroPoliza}
                  onChange={(e) =>
                    setForm({ ...form, numeroPoliza: e.target.value })
                  }
                  onBlur={() => {
                    if (
                      !form.id &&
                      !form.asegurado &&
                      esAseguradoraAfirme(form.aseguradora) &&
                      numeroPolizaAfirmeValido(form.numeroPoliza)
                    ) {
                      traerDeAfirme(form);
                    }
                  }}
                  required
                />
                {esAseguradoraAfirme(form.aseguradora) && (
                  <button
                    type="button"
                    onClick={() => traerDeAfirme(form)}
                    disabled={consultandoAfirme}
                    className="whitespace-nowrap rounded-lg border border-sky-600 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                  >
                    {consultandoAfirme ? "Consultando…" : "Traer de Afirme"}
                  </button>
                )}
              </div>
              {avisoAfirme && (
                <p className="mt-1 text-xs text-slate-500">{avisoAfirme}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Ramo</label>
              <input
                className={inputCls}
                list="ramos-list"
                value={form.ramo}
                onChange={(e) => setForm({ ...form, ramo: e.target.value })}
                required
              />
              <datalist id="ramos-list">
                {RAMOS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Aseguradora</label>
              <input
                className={inputCls}
                list="aseguradoras-list"
                value={form.aseguradora}
                onChange={(e) =>
                  setForm({ ...form, aseguradora: e.target.value })
                }
                required
              />
              <datalist id="aseguradoras-list">
                <option value="Afirme" />
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Asegurado</label>
              <input
                className={inputCls}
                value={form.asegurado}
                onChange={(e) =>
                  setForm({ ...form, asegurado: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className={labelCls}>Prima neta (MXN)</label>
              <input
                className={inputCls}
                value={form.primaNeta}
                onChange={(e) =>
                  setForm({
                    ...form,
                    primaNeta: e.target.value.replace(/[^0-9.]/g, ""),
                  })
                }
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Prima total (MXN)</label>
              <input
                className={inputCls}
                value={form.primaTotal}
                onChange={(e) =>
                  setForm({
                    ...form,
                    primaTotal: e.target.value.replace(/[^0-9.]/g, ""),
                  })
                }
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Vigencia inicio</label>
              <input
                type="date"
                className={inputCls}
                value={form.vigenciaInicio}
                onChange={(e) =>
                  setForm({ ...form, vigenciaInicio: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className={labelCls}>Vigencia fin</label>
              <input
                type="date"
                className={inputCls}
                value={form.vigenciaFin}
                onChange={(e) =>
                  setForm({ ...form, vigenciaFin: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className={labelCls}>Vehículo (opcional)</label>
              <input
                className={inputCls}
                value={form.vehiculo}
                onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>No. de serie (opcional)</label>
              <input
                className={inputCls}
                value={form.numeroSerie}
                onChange={(e) =>
                  setForm({ ...form, numeroSerie: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelCls}>Estatus de pago</label>
              <select
                className={inputCls}
                value={form.estatusPago}
                onChange={(e) =>
                  setForm({
                    ...form,
                    estatusPago: e.target.value as EstatusPago | "",
                  })
                }
              >
                <option value="">Sin dato</option>
                {ESTATUS_PAGO.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelCls}>Notas (opcional)</label>
              <input
                className={inputCls}
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">No. Póliza</th>
              <th className="px-4 py-3">Ramo</th>
              <th className="px-4 py-3">Aseguradora</th>
              <th className="px-4 py-3">Asegurado</th>
              <th className="px-4 py-3 text-right">Prima neta</th>
              <th className="px-4 py-3 text-right">Prima total</th>
              <th className="px-4 py-3">Vigencia</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Pago</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  {filtro === "VENCIMIENTOS"
                    ? "No hay pólizas próximas a vencer."
                    : "Aún no hay pólizas registradas."}
                </td>
              </tr>
            ) : (
              visibles.map((p) => {
                const meta = ESTADO_META[p.estado];
                const pago = p.estatusPago ? PAGO_META[p.estatusPago] : null;
                return (
                  <Fragment key={p.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.numeroPoliza}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.ramo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.aseguradora}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.asegurado}
                      {p.vehiculo && (
                        <div className="text-xs text-slate-400">{p.vehiculo}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {formatMXN(p.primaNeta)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {formatMXN(p.primaTotal)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.vigenciaInicio} → {p.vigenciaFin}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}
                      >
                        {meta.label}
                        {p.estado !== "VENCIDA" && p.estado !== "VIGENTE"
                          ? ` · ${p.diasParaVencer}d`
                          : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {pago ? (
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${pago.cls}`}
                        >
                          {pago.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Sin dato</span>
                      )}
                      {p.origenPago && (
                        <div
                          className="mt-1 text-[11px] text-slate-400"
                          title={p.pagoActualizadoAt ?? undefined}
                        >
                          {ORIGEN_LABEL[p.origenPago]}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.origenPago === "AFIRME" && (
                        <button
                          type="button"
                          onClick={() => verRecibos(p)}
                          className="mr-3 text-xs font-medium text-sky-700 hover:underline"
                        >
                          {abierta === p.id ? "Ocultar recibos" : "Recibos"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => abrirEdicion(p)}
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(p)}
                        className="ml-3 text-xs font-medium text-red-600 hover:underline"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                  {abierta === p.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={10} className="px-4 py-3">
                        <TablaRecibos recibos={recibos} />
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

function TablaRecibos({ recibos }: { recibos: ReciboGuardado[] | null }) {
  if (recibos === null) {
    return <p className="text-xs text-slate-400">Cargando recibos…</p>;
  }
  if (recibos.length === 0) {
    return <p className="text-xs text-slate-400">Sin recibos guardados.</p>;
  }
  return (
    <div>
      <table className="min-w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1 pr-4">Recibo</th>
            <th className="py-1 pr-4">Endoso</th>
            <th className="py-1 pr-4">Tipo</th>
            <th className="py-1 pr-4">Incisos</th>
            <th className="py-1 pr-4">Situación</th>
            <th className="py-1 pr-4">Vence</th>
            <th className="py-1 pr-4 text-right">Prima neta</th>
            <th className="py-1 pr-4 text-right">Prima total</th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
          {recibos.map((r) => (
            <tr key={r.idRecibo}>
              <td className="py-1 pr-4">{r.idRecibo}</td>
              <td className="py-1 pr-4">{r.numeroEndoso}</td>
              <td className="py-1 pr-4">
                {r.tipoRecibo === "RD" || r.primaTotal < 0 ? "Devolución" : "Cargo"}
              </td>
              <td className="py-1 pr-4">{r.incisos}</td>
              <td className="py-1 pr-4">{SITUACION_RECIBO[r.situacion]}</td>
              <td className="py-1 pr-4">{r.fechaVencimiento ?? "—"}</td>
              <td className="py-1 pr-4 text-right">{formatMXN(r.primaNeta)}</td>
              <td className="py-1 pr-4 text-right">{formatMXN(r.primaTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-400">
        Consultado en Afirme el {recibos[0].consultadoAt} por {recibos[0].consultadoPor}. Afirme no informa la fecha de pago.
      </p>
    </div>
  );
}
