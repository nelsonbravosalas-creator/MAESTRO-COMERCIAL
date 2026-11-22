# Plan de recuperación ante desastres (DR) — BravoCRM

**Estado: borrador sin ejecutar.** Este documento define el objetivo y el
procedimiento. La pieza que falta — y que nadie más que el dueño de la cuenta
de Neon/AWS puede hacer — es **ejecutarlo una vez de verdad** y medir cuánto
tarda. Un backup que nunca se restauró no es un backup, es una suposición.

## Objetivos (RPO / RTO)

| Métrica                                      | Objetivo | Justificación                                                                                                            |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| **RPO** (pérdida de datos máxima aceptable)  | 24 horas | Un backup diario cubre esto. Si el negocio necesita menos, hay que subir la frecuencia (ver "Siguiente paso").           |
| **RTO** (tiempo máximo para volver a operar) | 4 horas  | La restauración de datos tarda ~1 s (simulacro automático, 2026-11-22). Falta medir el paso de la app (ver "Simulacro"). |

_(Estos números son un punto de partida razonable para una app de gestión
interna sin usuarios pagando en tiempo real, no un compromiso contractual.
Ajustar según lo que el negocio realmente necesite.)_

## Capas de respaldo

1. **Point-in-time recovery de Neon** (primera línea de defensa). Verificado el
   2026-11-22 con la API de Neon: el proyecto `patient-tooth-90299530` tiene
   `history_retention_seconds = 21600`, o sea **solo 6 horas** de PITR. Un
   borrado que se note al día siguiente ya no se recupera por esta vía: para
   eso está el backup externo.
2. **Backup externo diario** (`.github/workflows/backup.yml`, C-12). `pg_dump`
   en formato custom, subido a un bucket S3-compatible **fuera** de Neon.
   Retención objetivo: 7 diarios + 4 semanales + 12 mensuales.
   **Estado real (2026-11-22):** funcionando. Primer respaldo real:
   `bravocrm-20261122-184530.dump`, 216 KB (línea base de tamaño).
   - **[hecho]** Secrets y bucket configurados (2026-09-29).
   - **[hecho]** `pg_dump`/`pg_restore` corren en la imagen oficial
     `postgres:17-alpine` (variable `PG_IMAGE`), no en paquetes del runner.
     Entre el 29-09 y el 22-11 falló todas las noches porque el workflow
     instalaba `postgresql-client-15` con apt y ese paquete desapareció al
     pasar el runner a Ubuntu 26.04. **Neon corre Postgres 17.12: si Neon
     sube de versión mayor, hay que subir `PG_IMAGE` y el servicio
     `restore-target` a la misma.**
   - **Alcance:** se vuelca la base `neondb` entera, incluidas las tablas
     `bot_sessions` y `bot_reportes_pendientes` del bot de Subcontrataley,
     que comparte esta base. Restaurar el dump completo también restaura las
     tablas del bot.
   - **[hecho]** Poda de retención implementada (7 diarios + 4 semanales + 12
     mensuales). Solo toca claves que calzan exacto con el patrón
     `bravocrm-AAAAMMDD-HHMMSS.dump` que genera el propio workflow, nunca
     borra si quedan tantos respaldos como el tope o menos, y ordena por el
     timestamp de la clave. La variable de repo `BACKUP_RETENTION_DRY_RUN=true`
     hace que solo imprima lo que borraría: **conviene activarla para mirar la
     primera poda real (día 8) y quitarla después.**
   - **[hecho]** Alerta real en `alert-on-failure`: abre un issue en el repo
     (o comenta en el que ya esté abierto, para no crear uno por noche) usando
     `GITHUB_TOKEN`, sin secrets nuevos. Si además existe el secret
     `BACKUP_ALERT_SLACK_WEBHOOK`, avisa por Slack.
   - **[hecho]** Verificación de integridad: antes de subir, `pg_restore --list`
     confirma que el dump es legible. Un `pg_dump` truncado ya no se sube y se
     contabiliza como respaldo del día.

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

## Simulacro

**Automático, en cada corrida (desde 2026-11-22).** El job restaura el dump en
una base Postgres 17 desechable (servicio `restore-target` del propio job, no
toca Neon), compara las tablas de `public` del dump contra las creadas y exige
filas. Si falla, el dump no se sube y se abre la alerta. Los dos errores de
`pg_session_jwt` son esperables: es una extensión propia de Neon que no existe
en un Postgres normal.

Esto prueba que **los datos** se pueden restaurar. No prueba que **la app**
arranque contra la base restaurada (paso 4 del procedimiento), así que sigue
haciendo falta el simulacro trimestral manual:

1. Agendar (calendario del responsable técnico, cada 3 meses).
2. Ejecutar el procedimiento de restauración de arriba contra una base de
   datos de prueba.
3. Medir el tiempo real desde "empiezo" hasta "el paso 4 pasa".
4. Registrar acá abajo: fecha, quién lo hizo, cuánto tardó, qué falló.

### Registro de simulacros

| Fecha      | Responsable                                | Duración         | Resultado                                                                        |
| ---------- | ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------- |
| 2026-11-22 | Automático (`backup.yml`, run 45056850244) | 1 s (solo datos) | 40/40 tablas de `public`, ~1.569 filas, 2 errores no fatales de `pg_session_jwt` |

## Contactos

| Rol                 | Contacto                      |
| ------------------- | ----------------------------- |
| Responsable técnico | Nelson Bravo (dueño del repo) |

_(Completar con contacto real de soporte de Neon/Vercel si se contrata un plan
con soporte prioritario.)_

## Siguiente paso recomendado

Los secrets, el bucket y la restauración de datos ya están verificados
(2026-11-22). Lo que queda:

1. Simulacro manual de la app: descargar un dump, verificar el `.sha256`,
   restaurarlo en un branch nuevo de Neon, apuntar el backend local a esa base
   y correr `scripts/smoke.sh`. **Cronometrar** y anotar la fila.
2. Revisar en el panel del bucket que tenga cifrado en reposo activo (el
   workflow no lo puede comprobar con sus credenciales).
3. Mirar la primera poda real (día 8) con `BACKUP_RETENTION_DRY_RUN=true`.
4. Evaluar subir el PITR de Neon por encima de 6 horas si el plan lo permite.
