# Cobranza diaria

Proceso que corre todos los días a las 7:00 (America/Mexico_City), consulta
los pagos del día anterior en cada aseguradora, los registra en las pólizas
del portal y genera el reporte de pólizas pagadas, pendientes y canceladas
(`<dir de DATABASE_PATH>/uploads/reportes-cobranza/`).

## Instalación en el servidor

```sh
sudo cp deploy/cobranza-diaria.service deploy/cobranza-diaria.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cobranza-diaria.timer
systemctl list-timers cobranza-diaria.timer
```

Corrida manual: `npm run cobranza:diaria -- --fecha 2026-11-12 --sin-correo`.
Bitácora: `journalctl -u cobranza-diaria`.

## Variables (.env)

| Variable | Uso |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor de correo para enviar el reporte |
| `COBRANZA_CORREO_PARA` | Destinatarios (separados por coma) |
| `COBRANZA_CORREO_DE` | Remitente (por omisión `SMTP_USER`) |
| `COBRANZA_DIAS_GRACIA` | Días de gracia para pagar un recibo (30) |
| `COBRANZA_ZONA_HORARIA` | Zona para calcular "ayer" (America/Mexico_City) |

## Aseguradoras

| Aseguradora | Fuente | Estado |
|---|---|---|
| Afirme | Web service `getRecibosPolizaActual` por póliza | Listo |
| Zurich | Web service `WSInfoRecibosPago` | Falta el manual del servicio |
| Quálitas, Banorte, El Potosí, HDI, General de Seguros | Portal de agentes | Faltan accesos |
