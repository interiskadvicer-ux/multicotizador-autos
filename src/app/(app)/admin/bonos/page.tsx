import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import BonosManager from "@/components/bonos/BonosManager";

export const dynamic = "force-dynamic";

export default async function BonosPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN"])) redirect("/");

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bonos El Potosí</h1>
        <p className="mt-1 text-sm text-slate-600">
          Carga el reporte mensual, revisa las cifras bimestrales de los agentes y el bono mensual del promotor,
          envía los correos y controla facturas y pagos.
        </p>
      </header>
      <BonosManager />
    </main>
  );
}
