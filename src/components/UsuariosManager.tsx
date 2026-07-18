"use client";

import { useEffect, useState } from "react";
import { ROLES, type Rol, type Usuario } from "@/domain/admin";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  POLIZAS: "Gestor de pólizas",
  COTIZADOR: "Cotizador",
};

interface NuevoState {
  email: string;
  nombre: string;
  password: string;
  rol: Rol;
}

const NUEVO_VACIO: NuevoState = {
  email: "",
  nombre: "",
  password: "",
  rol: "COTIZADOR",
};

export default function UsuariosManager() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<NuevoState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [reset, setReset] = useState<{ id: number; password: string } | null>(
    null,
  );

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios");
      if (!res.ok) throw new Error("No se pudieron cargar los usuarios.");
      const data = await res.json();
      setUsuarios(data.usuarios as Usuario[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevo),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo crear el usuario.");
      }
      setNuevo(null);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  async function actualizar(id: number, cambios: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo actualizar el usuario.");
      }
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    }
  }

  async function guardarReset() {
    if (!reset) return;
    if (reset.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    await actualizar(reset.id, { password: reset.password });
    setReset(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setNuevo({ ...NUEVO_VACIO })}
          className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          + Nuevo usuario
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {nuevo && (
        <form
          onSubmit={crear}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-700">
            Nuevo usuario
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Nombre</label>
              <input
                className={inputCls}
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Correo</label>
              <input
                type="email"
                className={inputCls}
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Contraseña</label>
              <input
                type="password"
                className={inputCls}
                value={nuevo.password}
                onChange={(e) =>
                  setNuevo({ ...nuevo, password: e.target.value })
                }
                placeholder="Mínimo 8 caracteres"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Rol</label>
              <select
                className={inputCls}
                value={nuevo.rol}
                onChange={(e) =>
                  setNuevo({ ...nuevo, rol: e.target.value as Rol })
                }
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
            <button
              type="button"
              onClick={() => setNuevo(null)}
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
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {u.nombre}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      value={u.rol}
                      onChange={(e) =>
                        actualizar(u.id, { rol: e.target.value })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {ETIQUETA_ROL[r.value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
                        u.activo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        actualizar(u.id, { activo: !u.activo })
                      }
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReset({ id: u.id, password: "" })}
                      className="ml-3 text-xs font-medium text-sky-700 hover:underline"
                    >
                      Cambiar contraseña
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reset && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-800">
              Nueva contraseña
            </h3>
            <input
              type="password"
              className={inputCls}
              value={reset.password}
              onChange={(e) =>
                setReset({ ...reset, password: e.target.value })
              }
              placeholder="Mínimo 8 caracteres"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReset(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarReset}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
