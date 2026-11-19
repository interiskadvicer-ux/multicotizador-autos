"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FacturaBonoForm({ token }: { token: string }) {
  const router = useRouter();
  const [pdf, setPdf] = useState<File | null>(null);
  const [xml, setXml] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf || !xml) return;
    setEnviando(true);
    setError(null);
    const fd = new FormData();
    fd.append("pdf", pdf);
    fd.append("xml", xml);
    const res = await fetch(`/api/bonos/factura/${token}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo subir la factura.");
      return;
    }
    setOk(true);
    router.refresh();
  }

  const input = "mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sky-800";
  return (
    <form onSubmit={enviar} className="mt-4 space-y-3">
      <label className="block text-xs text-slate-600">
        Factura PDF
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className={input} />
      </label>
      <label className="block text-xs text-slate-600">
        Factura XML
        <input type="file" accept=".xml,text/xml,application/xml" onChange={(e) => setXml(e.target.files?.[0] ?? null)} className={input} />
      </label>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">Factura recibida. Gracias.</div>}
      <button
        type="submit"
        disabled={!pdf || !xml || enviando}
        className="w-full rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
      >
        {enviando ? "Subiendo…" : "Subir factura"}
      </button>
    </form>
  );
}
