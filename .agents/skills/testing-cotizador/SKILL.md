---
name: testing-cotizador
description: Test the multicotizador de autos end-to-end (form, per-insurer discounts, PDF export). Use when verifying UI or quote-calculation changes.
---

# Testing — Multicotizador de Autos

Next.js app (App Router) que cotiza 8 aseguradoras. Primas actualmente **simuladas** (mock en `src/insurers/base.ts`).

## Dónde está corriendo
- Producción: https://cotizador.interiskad.com (AWS EC2, Elastic IP `3.17.121.4`, dominio en GoDaddy).
- Deploy manual: copiar repo por SSH, `npm ci`, `npm run build`, `sudo systemctl restart cotizador` (nginx proxy + Let's Encrypt). La instancia tiene ~900 MB RAM: usar `NODE_OPTIONS="--max-old-space-size=1536"` para el build.
- Local: `npm run dev` (o `PORT=xxxx npm run start` tras build) y `POST /api/cotizar`.

## Verificaciones rápidas (sin UI)
```bash
npm run lint && NODE_OPTIONS="--max-old-space-size=1536" npm run build
curl -s -X POST <base>/api/cotizar -H "Content-Type: application/json" \
  -d '{"vehiculo":{"marca":"Nissan","modelo":"Versa","anio":2022,"version":"S","uso":"PARTICULAR","cp":"64000"},"conductor":{"nombre":"Test","fechaNacimiento":"1990-05-10","genero":"M","cp":"64000"},"paquete":"AMPLIA","formaPago":"CONTADO","descuentos":{"qualitas":45}}'
```
El resultado incluye `prima.descuentoPorcentaje`, `descuentoMonto`, `primaNetaSinDescuento`, `primaNeta`.

## Flujo UI a probar
1. Abrir la URL. Sección "Descuentos por aseguradora" precargada con defaults por adaptador (`descuentoDefault` en cada `src/insurers/*.ts`).
2. El input `type="date"` (fecha de nacimiento) es quisquilloso: hacer click en el segmento del mes y teclear solo dígitos `MMDDYYYY` (p.ej. `05101990`). Escribir con `/` puede desordenarlo.
3. Editar un descuento (p.ej. Banorte a 50), llenar C.P. y fecha, click "Cotizar".
4. Verificar en la tarjeta del broker (pantalla interna): badge `−X% desc.` con el valor editado, desglose "Prima neta (sin desc.)" → "Descuento (X%)" → "Prima neta". Un descuento mayor debe bajar la prima total (posible "Mejor precio"). Los descuentos SÍ se muestran en la pantalla interna del broker.
5. Click "Descargar PDF para el cliente" → se descarga `cotizacion-<cliente>.pdf` en `~/Downloads`. Abrir con `file:///home/ubuntu/Downloads/<archivo>.pdf` en Chrome y verificar:
   - Título "Cotización de Seguro de Auto" y datos del cliente/vehículo.
   - Tabla de precios con SOLO estas columnas: `Aseguradora | Prima neta | Recargo pago fracc. | Derechos | IVA | Prima total`. El PDF del cliente **NO** debe mostrar descuento (ni columna "Descuento" ni "Prima neta s/desc." ni `%`); el descuento es info interna y solo va en la pantalla del broker. Truco: editar un descuento (ej. Banorte 50%) y confirmar que ese dato NO aparece en el PDF.
   - Tabla "Coberturas incluidas — <paquete>" (Cobertura Amplia / Cobertura Limitada / Responsabilidad Civil (Básica)), con filas de coberturas y columnas por aseguradora. Comparar paquetes: en Básica (RC), "Daños Materiales", "Robo Total", "Gastos Médicos Ocupantes" y "Asistencia Vial y Legal" salen como "No incluida"; en Amplia salen con suma asegurada/deducible. Descargas repetidas se guardan como `cotizacion-<cliente> (1).pdf`, etc.

## Módulo login / pólizas / auditoría (PR #3+)
Con este módulo el sitio deja de ser público: `/` exige sesión. Roles: `ADMIN` (todo), `POLIZAS` (cotizador+pólizas), `COTIZADOR` (solo cotizador). Persistencia en SQLite (`./data/app.db`), fuera del repo.

### Preparar la prueba (setup, no grabar)
1. Build + start local: `NODE_OPTIONS="--max-old-space-size=1536" npm run build && PORT=3000 npm start`. Requiere `AUTH_SECRET` (≥16 chars) en el entorno.
2. Sembrar admin: `AUTH_SECRET=... ADMIN_EMAIL=admin@interiskad.com ADMIN_PASSWORD=Admin12345 ADMIN_NOMBRE="Omar (Admin)" npm run seed:admin` (idempotente).
3. Pre-cargar pólizas por API para cubrir los 4 estados de vencimiento. Login con cookie jar, luego `POST /api/polizas`. La clasificación depende de días a `vigenciaFin` vs hoy: `<0` VENCIDA, `≤30` POR_VENCER, `≤60` PROXIMA, resto VIGENTE. Elegir fechas relativas a la fecha actual del entorno (no hardcodear años).
4. Opcional para un reporte de actividad limpio: `node -e "const D=require('better-sqlite3');const db=new D('./data/app.db');db.prepare('DELETE FROM activity_logs').run()"`. Ojo: `pkill -f "next start"` + `rm data/app.db*` puede fallar/quedar a medias; la DB conserva datos entre corridas, así que puede haber usuarios/pólizas de pruebas previas (no bloquea, solo crea "ruido"—crea entidades nuevas con nombres distintos).

### Flujo UI a grabar
1. Sin sesión, ir a `/` → debe redirigir a `/login`.
2. Login: contraseña incorrecta muestra "Correo o contraseña incorrectos."; la correcta entra. Admin ve 4 links (Cotizador/Pólizas/Usuarios/Actividad) y "Nombre · Administrador".
3. Pólizas: verificar badges de estado; "+ Nueva póliza" con fechas para forzar POR_VENCER (≤30d); pestaña "Vencimientos" debe excluir las VIGENTE.
4. "Descargar Excel" (en pestaña Vencimientos el link lleva `?tipo=vencimientos`).
5. Usuarios: crear un COTIZADOR. Cerrar sesión, entrar como él → NavBar solo "Cotizador"; escribir `/polizas` a mano → redirige a `/` (prueba el bloqueo en servidor, no solo links ocultos).
6. Actividad (como admin): registra LOGIN/POLIZA_CREAR/EXPORT_POLIZAS/USUARIO_CREAR con usuario; filtrar por usuario reduce la tabla; "Descargar Excel" respeta el filtro (`?usuarioId=N`).

### Verificar los .xlsx descargados
`pip install openpyxl -q` y leer con `load_workbook(path).active`; comprobar firma `PK`, headers y filas. Hoja "Vencimientos" tiene columnas incl. "Días p/vencer"/"Estado"; hoja "Actividad" tiene Fecha/Usuario/Acción/Detalle.

### Fechas en inputs `type="date"`
Escribir el string completo `MM/DD/YYYY` en el campo funciona (queda como `text="YYYY-MM-DD"` en el DOM). Verificar el DOM tras teclear antes de guardar.

## Notas / posibles fallas
- El PDF se genera 100% en el navegador con `jspdf` + `jspdf-autotable` (`src/lib/pdf.ts`); si falla, revisar imports client-side ("use client" en QuoteResults).
- No hay CI configurado en el repo (sin `.github/workflows`); `git_pr_checks` devuelve 0 checks.
- Al agregar aseguradoras, cada adaptador debe tener `descuentoDefault` y pasar `resolverDescuento(...)` a `cotizarMock`.
- `better-sqlite3` es módulo nativo: si el build/start falla por él, revisar `serverComponentsExternalPackages: ["better-sqlite3"]` en `next.config.mjs`.

## Devin Secrets Needed
- `AUTH_SECRET` — secreto JWT (≥16 chars) para firmar la sesión; requerido para build/start y seed del módulo de login/pólizas.
- `COTIZADOR_EC2_KEY` — llave SSH de la instancia EC2 (solo para desplegar/verificar en producción). No se necesita para pruebas locales.
