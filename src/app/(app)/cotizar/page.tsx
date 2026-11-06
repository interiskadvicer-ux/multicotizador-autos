import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth";
import CotizadorWizard from "@/components/CotizadorWizard";

export default async function CotizarPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const id = Number(searchParams.id);
  return (
    <CotizadorWizard
      key={searchParams.id ?? "nueva"}
      puedeDescontar={sesion.rol !== "AGENTE"}
      cotizacionId={Number.isInteger(id) && id > 0 ? id : null}
    />
  );
}
