import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import CobranzaManager from "@/components/CobranzaManager";

export default async function CobranzaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN", "POLIZAS"])) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cobranza</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carga los estados de cuenta de las aseguradoras para marcar pólizas
          como pagadas, o registra un pago manualmente.
        </p>
      </header>
      <CobranzaManager esAdmin={sesion.rol === "ADMIN"} />
    </main>
  );
}
