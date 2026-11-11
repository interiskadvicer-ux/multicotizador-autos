"use client";

import { useEffect, useState } from "react";
import type { Contratante } from "@/lib/cotizaciones";
import type { CatalogosClienteGs } from "@/lib/gs/catalogos-cliente";

// Datos del cliente que General de Seguros pide para emitir, con las claves de
// su CatalogosWS (estado civil, ocupación, giro y colonia).
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

type Campo = keyof Contratante;

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

export default function DatosGs({
  contratante,
  onChange,
  disabled,
}: {
  contratante: Contratante;
  onChange: (c: Contratante) => void;
  disabled?: boolean;
}) {
  const [catalogos, setCatalogos] = useState<CatalogosClienteGs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cp = /^\d{5}$/.test(contratante.cp) ? contratante.cp : "";

  useEffect(() => {
    let vigente = true;
    setError(null);
    fetch(`/api/gs/catalogos-cliente${cp ? `?cp=${cp}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar los catálogos de General de Seguros.");
        if (vigente) setCatalogos(data as CatalogosClienteGs);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "Error inesperado."));
    return () => {
      vigente = false;
    };
  }, [cp]);

  // Preselecciona la colonia de GS con el mismo nombre que la de SEPOMEX.
  useEffect(() => {
    if (!catalogos || contratante.gsColonia || !contratante.colonia) return;
    const igual = catalogos.colonias.find((c) => normalizar(c.nombre) === normalizar(contratante.colonia));
    if (igual) onChange({ ...contratante, gsColonia: igual.id });
  }, [catalogos, contratante, onChange]);

  const set = (campo: Campo, valor: string) => onChange({ ...contratante, [campo]: valor });
  const etiqueta = (texto: string, obligatorio = true) => (
    <label className={labelCls}>
      {texto}
      {obligatorio && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
    </label>
  );
  const texto = (campo: Campo, label: string, obligatorio = true, extra: Partial<JSX.IntrinsicElements["input"]> = {}) => (
    <div key={campo}>
      {etiqueta(label, obligatorio)}
      <input
        className={inputCls}
        value={String(contratante[campo] ?? "")}
        disabled={disabled}
        onChange={(e) => set(campo, e.target.value)}
        {...extra}
      />
    </div>
  );
  const lista = (campo: Campo, label: string, opciones: { id: string; nombre: string }[], obligatorio = true) => (
    <div key={campo}>
      {etiqueta(label, obligatorio)}
      <select
        className={inputCls}
        value={String(contratante[campo] ?? "")}
        disabled={disabled || !opciones.length}
        onChange={(e) => set(campo, e.target.value)}
      >
        <option value="">{opciones.length ? "Selecciona" : "Cargando…"}</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Datos del cliente (General de Seguros)</h3>
        <p className="text-xs text-slate-500">
          General de Seguros da de alta al cliente con estos datos al emitir. Deben ser los datos reales del asegurado.
        </p>
      </div>
      {contratante.tipoPersona !== "FISICA" && (
        <p className="text-xs text-amber-700">Por ahora la emisión en General de Seguros es solo para persona física.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {texto("nombres", "Nombre(s)", true, { maxLength: 100 })}
        {texto("apellidoPaterno", "Apellido paterno", true, { maxLength: 60 })}
        {texto("apellidoMaterno", "Apellido materno", false, { maxLength: 60 })}
        {texto("numExterior", "Número exterior", true, { maxLength: 20 })}
        {texto("celular", "Celular", !contratante.telefono, { maxLength: 20, inputMode: "tel" })}
        {texto("fechaNacimiento", "Fecha de nacimiento", true, { type: "date" })}
        {lista("genero", "Género", [{ id: "H", nombre: "Hombre" }, { id: "M", nombre: "Mujer" }])}
        {lista("gsEstadoCivil", "Estado civil", catalogos?.estadosCiviles ?? [])}
        {lista("gsOcupacion", "Ocupación", catalogos?.ocupaciones ?? [])}
        {lista("gsGiro", "Giro o actividad", catalogos?.giros ?? [])}
        {cp
          ? lista("gsColonia", "Colonia (catálogo de General de Seguros)", catalogos?.colonias ?? [])
          : (
            <p key="gsColonia" className="text-xs text-slate-500">Captura el código postal para elegir la colonia.</p>
          )}
        {texto("curp", "CURP", false, { maxLength: 18, className: `${inputCls} uppercase` })}
      </div>
    </div>
  );
}
