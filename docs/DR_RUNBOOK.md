# Plan de recuperación ante desastres (DR) — BravoCRM

**Estado: borrador sin ejecutar.** Este documento define el objetivo y el
procedimiento. La pieza que falta — y que nadie más que el dueño de la cuenta
de Neon/AWS puede hacer — es **ejecutarlo una vez de verdad** y medir cuánto
tarda. Un backup que nunca se restauró no es un backup, es una suposición.

## Objetivos (RPO / RTO)

| Métrica | Objetivo | Justificación |
|---|---|---|
| **RPO** (pérdida de datos máxima aceptable) | 24 horas | Un backup diario cubre esto. Si el negocio necesita menos, hay que subir la frecuencia (ver "Siguiente paso"). |
| **RTO** (tiempo máximo para volver a operar) | 4 horas | No validado todavía — ver sección "Simulacro". |

*(Estos números son un punto de partida razonable para una app de gestión
interna sin usuarios pagando en tiempo real, no un compromiso contractual.
Ajustar según lo que el negocio realmente necesite.)*

## Capas de respaldo

1. **Point-in-time recovery de Neon** (primera línea de defensa). Depende del
   plan contratado — **confirmar en el dashboard de Neon cuántos días de PITR
   incluye el plan actual**. Esto no está verificado en este documento porque
   requiere acceso a la cuenta de Neon.
2. **Backup externo diario** (`.github/workflows/backup.yml`, C-12). `pg_dump`
   en formato custom, subido a un bucket S3-compatible **fuera** de Neon.
   Retención objetivo: 7 diarios + 4 semanales + 12 mensuales.
   **Estado real:** el workflow existe pero necesita:
   - Los secrets `PROD_DATABASE_URL`, `BACKUP_S3_BUCKET`,
     `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (y opcionalmente
     `BACKUP_S3_ENDPOINT_URL` si no es AWS S3) configurados en
     Settings → Secrets and variables → Actions.
   - Un bucket real (S3, Cloudflare R2 o Backblaze B2 — cualquiera con API
     compatible con S3 sirve).
   - Implementar la poda de retención (hoy es un placeholder deliberado: podar
     mal es peor que no podar).
   - Una alerta real en `alert-on-failure` (hoy solo deja un `::error::` en el
     log de Actions, que nadie mira si no lo va a buscar).

## Procedimiento de restauración

```bash
# 1. Traer el dump más reciente desde el bucket
aws s3 cp s3://<bucket>/daily/<archivo>.dump ./restore.dump

# 2. Verificar integridad contra el checksum subido junto al dump
sha256sum -c <archivo>.dump.sha256

# 3. Restaurar en una base de datos limpia (NUNCA sobre la de producción directamente)
createdb bravocrm_restore_test
pg_restore --no-owner --no-privileges -d bravocrm_restore_test restore.dump

# 4. Apuntar una instancia local del backend a esa base y validar:
#    - GET /api/health responde 200 con db: 'ok'
#    - Login funciona (POST /api/auth/login)
#    - GET /api/quotations devuelve datos coherentes con la fecha del dump
```

Si el resultado del paso 4 es correcto, recién ahí se decide (según la
severidad real del incidente) si promover esa base restaurada a producción.

## Escenarios

### Se cae Neon
No hay mitigación posible desde la app. Comunicar el estado, monitorear el
status page del proveedor. Si la caída se extiende, evaluar restaurar el
backup externo más reciente en un proveedor distinto (más trabajo, solo si el
RTO de 4h está en riesgo real).

### Borrado accidental de datos (no caída de infraestructura)
Primero intentar PITR de Neon (más preciso, restaura a un segundo exacto antes
del borrado). El backup externo diario es el respaldo de ese respaldo.

### Migración mal aplicada (ver `docs/MIGRACIONES.md`)
Cada migración corre en su propia transacción — un fallo a mitad de camino no
debería dejar el esquema roto. Si igual pasa: `npm run migrate:down` revierte
la última. Si el daño ya se escribió (no es un problema de esquema sino de
datos), ir al backup.

## Simulacro trimestral

**No implementado.** Es un proceso humano, no algo que se automatice solo:

1. Agendar (calendario del responsable técnico, cada 3 meses).
2. Ejecutar el procedimiento de restauración de arriba contra una base de
   datos de prueba.
3. Medir el tiempo real desde "empiezo" hasta "el paso 4 pasa".
4. Registrar acá abajo: fecha, quién lo hizo, cuánto tardó, qué falló.

### Registro de simulacros

| Fecha | Responsable | Duración | Resultado |
|---|---|---|---|
| _(ninguno todavía)_ | | | |

## Contactos

| Rol | Contacto |
|---|---|
| Responsable técnico | Nelson Bravo (dueño del repo) |

*(Completar con contacto real de soporte de Neon/Vercel si se contrata un plan
con soporte prioritario.)*

## Siguiente paso recomendado

Antes de confiar en este plan: (1) configurar los secrets del workflow de
backup, (2) correr el simulacro de restauración una vez y llenar la tabla de
arriba, (3) recién después, considerar esto "implementado" y no solo
"diseñado".
