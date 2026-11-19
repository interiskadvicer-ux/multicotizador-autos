"use client";

export const input = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none";
export const boton = "rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50";
export const botonSec = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const tarjeta = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const BIMESTRES = ["1er (Ene–Feb)", "2do (Mar–Abr)", "3er (May–Jun)", "4to (Jul–Ago)", "5to (Sep–Oct)", "6to (Nov–Dic)"];

export function pct(n: number): string {
  return `${(n * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function Mensajes({ error, aviso }: { error: string | null; aviso: string | null }) {
  return (
    <>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {aviso && <div className="whitespace-pre-line rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{aviso}</div>}
    </>
  );
}

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data as T;
}

export function json(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
