# Hallazgos bloqueados por acceso externo

Estos ítems del plan de remediación de riesgo alto **no se pudieron cerrar**
en esta sesión porque requieren credenciales, cuentas o infraestructura a la
que este entorno no tiene acceso (dashboards de Vercel/Neon, un motor Docker
funcionando, o un preview desplegado en vivo). Se documenta qué falta
exactamente y qué es lo primero que hay que hacer.

## A-08 — Entorno de staging

**Nada implementado.** Requiere:

1. Crear un branch de Neon (copy-on-write de producción) — dashboard de Neon.
2. Crear un proyecto/entorno `staging` en Vercel apuntando a ese branch —
   dashboard de Vercel.
3. Variables de entorno propias (JWT_SECRET, ALLOWED_ORIGINS, etc. — nunca
   compartidas con producción).
4. Un script `npm run anonymize` que enmascare nombres/emails/RUT/teléfonos al
   refrescar staging desde un dump de producción — esto sí es código y **no
   se escribió** porque depende de tener staging para poder probarlo contra
   datos reales (con datos falsos inventados el script no prueba nada útil).

**Primer paso concreto:** crear el branch de Neon. Todo lo demás depende de eso.

## A-09 — CD con gates, migraciones y rollback

Ver `docs/DESPLIEGUE.md` — parcialmente resuelto (CI ya bloquea con 4 checks;
falta que Vercel/GitHub branch protection lo hagan obligatorio, lo cual
requiere configuración en ambos dashboards). `scripts/smoke.sh` está escrito
pero nunca se ejecutó contra un deploy real.

## A-14 — Pruebas contra PostgreSQL real

**No implementado como suite separada.** Lo que sí existe:

- El job `integration` de `.github/workflows/ci.yml` levanta un Postgres 15
  real en un contenedor de GitHub Actions y corre `npm run migrate:up` contra
  él — así que las **migraciones** sí se validan contra Postgres real en cada
  PR (eso es C-11/A-14 parcial).
- Pero ese mismo job después corre `npm test`, que es la suite normal —
  **con pools falsos en memoria**, no las queries SQL reales. Ninguna prueba
  hoy ejercita `v_quotation_totals`, los `CHECK`, el soft-delete real, ni el
  comportamiento transaccional de la importación contra una base de datos de
  verdad.

**Por qué no se escribió `test:integration` en esta sesión:** el Docker local
de este entorno no tiene el daemon corriendo (`docker ps` falla), así que
cualquier prueba de integración que se escribiera no se podría ejecutar ni
verificar aquí — el riesgo de escribir SQL con bugs sutiles sin poder
correrlo ni una vez es alto. Se prefirió dejarlo documentado en vez de
entregar algo sin verificar.

**Primer paso concreto:**

```bash
docker compose up -d postgres   # requiere Docker Desktop corriendo
cd backend && npm run migrate:up
# escribir backend/src/api/__tests__/integration/*.test.ts contra pool real,
# con DATABASE_URL apuntando al postgres del compose
```

Casos prioritarios según el plan: totales de `v_quotation_totals` vs. cálculo
esperado, importación que falla a mitad de camino (no debe dejar datos
parciales), `CHECK` que rechaza cantidades negativas, soft-delete (no aparece
en listados pero sigue en la tabla), unicidad de correlativo bajo dos inserts
concurrentes.

## A-15 — Pruebas end-to-end (Playwright)

**No implementado.** Requiere una instancia corriendo de la app (frontend +
backend + base de datos) contra la cual ejecutar los navegadores headless de
Playwright — no algo que se pueda montar y verificar de forma confiable en
este entorno sin acceso a un preview desplegado.

**Primer paso concreto** (una vez que exista un preview de Vercel o un
entorno local corriendo):

```bash
cd frontend
npm i -D @playwright/test
npx playwright install
```

Los 5 escenarios del plan (login, cotización con totales, cambio de estado a
proyecto, costo de ejecución, exportar PDF) más el de permisos por rol
(`C-10`) son el punto de partida — están detallados en el plan original.

## A-18 — Plan de recuperación ante desastres

**Parcialmente hecho:** `docs/DR_RUNBOOK.md` existe con los 5 escenarios,
RTO/RPO propuestos y el procedimiento de restauración paso a paso (escrito en
la remediación de críticos, C-12). Lo que falta y **no se puede hacer sin
acceso real**:

- Confirmar cuántos días de PITR incluye el plan de Neon contratado.
- Ejecutar el simulacro de restauración una vez y medir el tiempo real.
- Confirmar que al menos dos personas tienen acceso administrativo a
  Vercel/Neon/GitHub/DNS (esto es una decisión organizacional, no técnica).
- Credenciales de emergencia en un gestor de contraseñas compartido.

## Resumen: qué necesita el usuario para desbloquear todo esto

| Ítem | Acceso necesario                                                          |
| ---- | ------------------------------------------------------------------------- |
| A-08 | Dashboard de Neon (crear branch) + Vercel (nuevo proyecto/env)            |
| A-09 | GitHub branch protection settings + Vercel deploy hooks                   |
| A-14 | Docker Desktop corriendo localmente (o cualquier Postgres real accesible) |
| A-15 | Un preview/entorno desplegado y accesible por HTTP                        |
| A-18 | Dashboard de Neon (plan de PITR) + decisión organizacional sobre accesos  |
