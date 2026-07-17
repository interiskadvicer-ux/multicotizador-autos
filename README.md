# Multicotizador de Autos

Aplicación web para brokers de seguros en México. Captura los datos de un
vehículo/conductor una sola vez y consulta **en paralelo** a varias
aseguradoras para comparar primas y coberturas lado a lado.

Aseguradoras contempladas: **Quálitas, Banorte, HDI, Zurich, GNP, Seguros El
Potosí, Afirme y Atlas**.

> ⚠️ **Estado actual: prototipo funcional con datos SIMULADOS.**
> Los adaptadores devuelven cotizaciones calculadas localmente (determinísticas)
> para poder probar el flujo completo. Cada adaptador tiene marcado el punto
> exacto (`TODO(integración)`) donde se conecta el web service real de la
> aseguradora. Ver [Integración real](#integración-real).

## Stack

- [Next.js 14](https://nextjs.org/) (App Router) + TypeScript
- Tailwind CSS
- API Route (`/api/cotizar`) que orquesta a todos los adaptadores

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # ESLint
npm run build    # build de producción
```

## Arquitectura

```
src/
  domain/
    types.ts        # Interfaz común: CotizacionRequest / CotizacionResultado
    catalogs.ts     # Catálogos base para el formulario (marcas, paquetes...)
  insurers/
    types.ts        # Contrato InsurerAdapter
    base.ts         # Generador de cotización simulada (reemplazable)
    qualitas.ts     # Un adaptador por aseguradora
    banorte.ts
    hdi.ts  zurich.ts  gnp.ts  elpotosi.ts  afirme.ts  atlas.ts
    registry.ts     # Registro central de aseguradoras
  lib/
    quote-service.ts # Consulta a TODAS en paralelo (con timeout y manejo de error)
    format.ts
  app/
    api/cotizar/route.ts  # Endpoint POST
    page.tsx              # Formulario + comparativa
  components/
    QuoteForm.tsx
    QuoteResults.tsx
```

El multicotizador solo conoce la interfaz `InsurerAdapter`. Agregar una
aseguradora nueva = crear un archivo en `src/insurers/` + registrarlo en
`registry.ts`. Nada más cambia.

## Integración real

Cada aseguradora expone su propio web service (SOAP o REST) con catálogos y
formatos distintos. Para conectar uno:

1. Copia `.env.example` a `.env.local` y llena las credenciales de esa
   aseguradora (`<ASEGURADORA>_WS_URL`, `_WS_USER`, `_WS_PASS`).
2. En su adaptador (p. ej. `src/insurers/qualitas.ts`), reemplaza la llamada a
   `cotizarMock(...)` por:
   - autenticación contra el web service,
   - mapeo de `CotizacionRequest` al formato de entrada del WS (incluye
     **homologación de catálogos** marca/modelo/versión, que difieren por
     aseguradora),
   - llamada al endpoint,
   - mapeo de la respuesta a `CotizacionResultado`,
   - manejo de errores/timeouts devolviendo `{ status: "error", error }`.
3. El resto de la app (orquestación en paralelo, ordenamiento por prima, UI de
   comparativa) ya funciona sin cambios.

### Lo que se necesita de cada aseguradora

- Documentación técnica del web service (WSDL/OpenAPI, endpoints, ejemplos).
- Credenciales de ambiente de pruebas y de producción.
- Catálogos oficiales (marca/submarca/versión, coberturas, paquetes).
