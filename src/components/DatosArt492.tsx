"use client";

import type { Contratante } from "@/lib/cotizaciones";

// Datos de identificación del cliente (art. 492) que Quálitas valida al emitir.
const OCUPACIONES = [["1", "Comerciante"], ["2", "Empleado"], ["3", "Empresario"], ["4", "Permisionario"], ["5", "Otro"], ["6", "Transportista"], ["7", "Hogar"]];
const GIROS = [["10", "Industrial"], ["20", "Comercial"], ["30", "Servicios"], ["31", "Servicios públicos"], ["32", "Servicios privados"], ["33", "Transporte"], ["34", "Turismo"], ["35", "Instituciones financieras"], ["36", "Educación"], ["37", "Salubridad"], ["38", "Fianzas y seguros"], ["42", "Otros"], ["43", "SOFOM"], ["44", "Transmisor de dinero"], ["45", "Centro cambiario"]];
const IDENTIFICACIONES = [["1", "INE / IFE"], ["2", "Licencia de manejo"], ["3", "Pasaporte"], ["4", "Cédula profesional"], ["5", "Cartilla militar"], ["6", "Matrícula consular"], ["8", "INAPAM"], ["10", "Forma migratoria"]];
const PARENTESCOS = [["1", "Esposo(a)"], ["2", "Hijo(a)"], ["3", "Padre"], ["4", "Madre"], ["5", "Hermano(a)"], ["6", "Abuelo(a)"], ["7", "Nieto(a)"], ["8", "Suegro(a)"], ["9", "Yerno / nuera"], ["10", "Cuñado(a)"], ["11", "Tío"], ["12", "Tía"]];
const ENTIDADES = [["AS", "Aguascalientes"], ["BC", "Baja California"], ["BS", "Baja California Sur"], ["CC", "Campeche"], ["CL", "Coahuila"], ["CM", "Colima"], ["CS", "Chiapas"], ["CH", "Chihuahua"], ["DF", "Ciudad de México"], ["DG", "Durango"], ["GT", "Guanajuato"], ["GR", "Guerrero"], ["HG", "Hidalgo"], ["JC", "Jalisco"], ["MC", "Estado de México"], ["MN", "Michoacán"], ["MS", "Morelos"], ["NT", "Nayarit"], ["NL", "Nuevo León"], ["OC", "Oaxaca"], ["PL", "Puebla"], ["QT", "Querétaro"], ["QR", "Quintana Roo"], ["SP", "San Luis Potosí"], ["SL", "Sinaloa"], ["SR", "Sonora"], ["TC", "Tabasco"], ["TS", "Tamaulipas"], ["TL", "Tlaxcala"], ["VZ", "Veracruz"], ["YN", "Yucatán"], ["ZS", "Zacatecas"], ["NE", "Nacido en el extranjero"]];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

type Campo = keyof Contratante;

export default function DatosArt492({
  contratante,
  onChange,
  disabled,
}: {
  contratante: Contratante;
  onChange: (c: Contratante) => void;
  disabled?: boolean;
}) {
  const fisica = contratante.tipoPersona === "FISICA";
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
  const lista = (campo: Campo, label: string, opciones: string[][], obligatorio = true) => (
    <div key={campo}>
      {etiqueta(label, obligatorio)}
      <select
        className={inputCls}
        value={String(contratante[campo] ?? "")}
        disabled={disabled}
        onChange={(e) => set(campo, e.target.value)}
      >
        <option value="">Selecciona</option>
        {opciones.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Identificación del cliente (Quálitas)</h3>
        <p className="text-xs text-slate-500">
          Quálitas valida estos datos al emitir (art. 492). Deben ser los datos reales del asegurado.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fisica && texto("nombres", "Nombre(s)", true, { maxLength: 100 })}
        {fisica && texto("apellidoPaterno", "Apellido paterno", true, { maxLength: 60 })}
        {fisica && texto("apellidoMaterno", "Apellido materno", false, { maxLength: 60 })}
        {texto("numExterior", "Número exterior", true, { maxLength: 20 })}
        {texto("numInterior", "Número interior", false, { maxLength: 20 })}
        {texto("celular", "Celular", !contratante.telefono, { maxLength: 20, inputMode: "tel" })}
        {fisica && texto("fechaNacimiento", "Fecha de nacimiento", true, { type: "date" })}
        {fisica && lista("genero", "Género", [["H", "Hombre"], ["M", "Mujer"]], false)}
        {lista("nacionalidad", "Nacionalidad", [["1", "Mexicana"], ["2", "Extranjera"]], false)}
        {fisica && lista("entidadNacimiento", "Entidad de nacimiento", ENTIDADES)}
        {fisica && lista("ocupacion", "Ocupación", OCUPACIONES)}
        {lista("giro", "Giro o actividad", GIROS)}
        {fisica && texto("curp", "CURP", false, { maxLength: 18, className: `${inputCls} uppercase` })}
        {fisica && lista("tipoIdentificacion", "Identificación", IDENTIFICACIONES)}
        {fisica && texto("numeroIdentificacion", "Número de identificación", true, { maxLength: 40 })}
        {fisica && lista("pep", "¿Persona políticamente expuesta?", [["N", "No"], ["S", "Sí"]])}
        {fisica && contratante.pep === "S" && texto("pepNombre", "Nombre del funcionario", true, { maxLength: 150 })}
        {fisica && contratante.pep === "S" && lista("pepParentesco", "Parentesco con el funcionario", PARENTESCOS, false)}
      </div>
    </div>
  );
}
