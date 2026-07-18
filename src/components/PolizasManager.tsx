"use client";

import { useEffect, useMemo, useState } from "react";
import { RAMOS, type Poliza } from "@/domain/admin";
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

  const visibles = filtro === "TODAS" ? polizas : vencimientos;

  function abrirNueva() {
    setForm({ ...FORM_VACIO });
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
    });
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
      setForm(null);
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
        <div className="flex flex-wrap gap-2">
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
              <input
                className={inputCls}
                value={form.numeroPoliza}
                onChange={(e) =>
                  setForm({ ...form, numeroPoliza: e.target.value })
                }
                required
              />
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
                value={form.aseguradora}
                onChange={(e) =>
                  setForm({ ...form, aseguradora: e.target.value })
                }
                required
              />
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
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {filtro === "VENCIMIENTOS"
                    ? "No hay pólizas próximas a vencer."
                    : "Aún no hay pólizas registradas."}
                </td>
              </tr>
            ) : (
              visibles.map((p) => {
                const meta = ESTADO_META[p.estado];
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.numeroPoliza}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.ramo}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.aseguradora}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.asegurado}</td>
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
                    <td className="px-4 py-3 text-right whitespace-nowrap">
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
