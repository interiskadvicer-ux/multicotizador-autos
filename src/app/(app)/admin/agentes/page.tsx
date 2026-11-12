import { redirect } from "next/navigation";
import { getSesion, tieneAcceso } from "@/lib/auth";
import { PLANTILLAS_CONTRATO, existePlantilla } from "@/lib/agentes";
import AgentesManager from "@/components/AgentesManager";

export const dynamic = "force-dynamic";

export default async function AgentesPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  if (!tieneAcceso(sesion.rol, ["ADMIN"])) redirect("/");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Agentes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Revisa los documentos de cada solicitud y autoriza o rechaza el acceso al portal.
        </p>
      </header>
      <AgentesManager
        plantillas={PLANTILLAS_CONTRATO.map((p) => ({
          tipo: p.tipo,
          label: p.label,
          cargada: existePlantilla(p.tipo),
        }))}
      />
    </main>
  );
}
