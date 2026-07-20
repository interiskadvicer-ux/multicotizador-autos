"use client";

import { useCallback, useEffect, useState } from "react";
import type { RegistroActividad, Usuario } from "@/domain/admin";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

const ETIQUETA_ACCION: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  COTIZAR: "Cotización",
  POLIZA_CREAR: "Alta de póliza",
  POLIZA_EDITAR: "Edición de póliza",
  POLIZA_ELIMINAR: "Eliminación de póliza",
  EXPORT_POLIZAS: "Exportó pólizas",
  EXPORT_ACTIVIDAD: "Exportó actividad",
  USUARIO_CREAR: "Alta de usuario",
  USUARIO_EDITAR: "Edición de usuario",
};

export default function ActividadManager() {
  const [registros, setRegistros] = useState<RegistroActividad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const queryString = useCallback(() => {
    const params = new URLSearchParams();
    if (usuarioId) params.set("usuarioId", usuarioId);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", `${hasta} 23:59:59`);
    return params.toString();
  }, [usuarioId, desde, hasta]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/actividad?${queryString()}`);
      if (!res.ok) throw new Error("No se pudo cargar la actividad.");
      const data = await res.json();
      setRegistros(data.registros as RegistroActividad[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => (r.ok ? r.json() : { usuarios: [] }))
      .then((d) => setUsuarios(d.usuarios ?? []))
      .catch((err) => {
        // El filtro por usuario es opcional, así que degradamos a lista vacía,
        // pero dejamos rastro del fallo en consola en lugar de ocultarlo.
        console.error("No se pudo cargar la lista de usuarios:", err);
        setUsuarios([]);
      });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-4">
        <div>
          <label className={labelCls}>Usuario</label>
          <select
            className={inputCls}
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Desde</label>
          <input
            type="date"
            className={inputCls}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Hasta</label>
          <input
            type="date"
            className={inputCls}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <a
            href={`/api/actividad/export?${queryString()}`}
            className="w-full rounded-xl border border-emerald-600 bg-white px-4 py-2 text-center text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
          >
            Descargar Excel
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha (UTC)</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Sin actividad para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              registros.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {r.createdAt}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.usuarioEmail}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {ETIQUETA_ACCION[r.accion] ?? r.accion}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.detalle}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
