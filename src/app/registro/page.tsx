import { DOCUMENTOS_REQUERIDOS, PLANTILLAS_CONTRATO, existePlantilla } from "@/lib/agentes";
import RegistroAgenteForm from "@/components/RegistroAgenteForm";

export const dynamic = "force-dynamic";

export default function RegistroPage() {
  const plantillas = PLANTILLAS_CONTRATO.filter((p) => existePlantilla(p.tipo)).map((p) => ({
    tipo: p.tipo,
    label: p.label,
  }));
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Registro de agentes · Interiskad</h1>
          <p className="mt-1 text-sm text-slate-600">
            Llena tus datos y sube tu documentación. Revisaremos tu solicitud y, una vez
            autorizada, podrás entrar al portal con tu correo y la contraseña que elijas aquí.
          </p>
        </header>
        <RegistroAgenteForm
          documentos={DOCUMENTOS_REQUERIDOS.map((d) => ({ tipo: d.tipo, label: d.label }))}
          plantillas={plantillas}
        />
      </div>
    </div>
  );
}
