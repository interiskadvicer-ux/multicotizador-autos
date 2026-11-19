"use client";

import { useState } from "react";

const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
  "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
  "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
  "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
  "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

interface Props {
  documentos: { tipo: string; label: string }[];
  plantillas: { tipo: string; label: string }[];
}

export default function RegistroAgenteForm({ documentos, plantillas }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("password2")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    form.delete("password2");
    form.set("aceptaAviso", form.get("aceptaAviso") ? "true" : "false");
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/registro", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar tu registro.");
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-emerald-700">¡Solicitud enviada!</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu registro quedó en revisión. Cuando sea autorizado podrás entrar con tu correo y
          contraseña.
        </p>
        <a href="/login" className="mt-4 inline-block text-sm font-semibold text-sky-700 hover:underline">
          Ir al inicio de sesión
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-slate-800 sm:col-span-2">Datos del agente</h2>
        <div className="sm:col-span-2">
          <label className={labelCls}>Nombre completo o razón social</label>
          <input name="nombre" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Correo</label>
          <input name="email" type="email" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Teléfono (10 dígitos)</label>
          <input name="telefono" required inputMode="numeric" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>RFC</label>
          <input name="rfc" required maxLength={13} className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <select name="estadoRepublica" required className={inputCls} defaultValue="">
            <option value="" disabled>
              Selecciona…
            </option>
            {ESTADOS_MX.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Cédula CNSF (opcional)</label>
          <input name="cedula" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Contraseña (mín. 8 caracteres)</label>
          <input name="password" type="password" minLength={8} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Confirmar contraseña</label>
          <input name="password2" type="password" minLength={8} required className={inputCls} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Documentos (PDF, JPG o PNG, máx. 5 MB)</h2>
        {plantillas.length > 0 && (
          <div className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">
            Descarga, firma y sube los contratos:{" "}
            {plantillas.map((p, i) => (
              <span key={p.tipo}>
                {i > 0 && " · "}
                <a href={`/api/registro/plantillas/${p.tipo}`} className="font-semibold underline">
                  {p.label}
                </a>
              </span>
            ))}
          </div>
        )}
        {documentos.map((d) => (
          <div key={d.tipo}>
            <label className={labelCls}>{d.label}</label>
            <input
              name={d.tipo}
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </div>
        ))}
      </section>

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" name="aceptaAviso" required className="mt-0.5" />
        Acepto el aviso de privacidad y autorizo el resguardo de mis documentos para la
        validación de mi registro.
      </label>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <a href="/login" className="text-sm text-slate-500 hover:underline">
          Ya tengo cuenta
        </a>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </form>
  );
}
