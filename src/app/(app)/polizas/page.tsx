import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import PolizasManager from "@/components/PolizasManager";

export default async function PolizasPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN", "POLIZAS"])) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Administrador de pólizas
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Controla vigencias, avisos de renovación (30/60 días) y exporta a
          Excel.
        </p>
      </header>
      <PolizasManager />
    </main>
  );
}
