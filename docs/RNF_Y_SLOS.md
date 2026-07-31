# Requisitos no funcionales y SLOs — BravoCRM

**Estado: propuesta inicial, no validada con el negocio.** Estos números son
un punto de partida razonable para una app de gestión interna sin usuarios
pagando en tiempo real — no un compromiso contractual. Alguien con visión de
negocio (no solo técnica) debería revisarlos antes de considerarlos "el SLO".

| Categoría                     | Objetivo propuesto                                                       | Cómo se mide                                      | Estado                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Disponibilidad                | 99,5% mensual (≈ 3,6 h de indisponibilidad)                              | Monitor de uptime externo sobre `/api/health`     | **No configurado** — requiere una cuenta externa (UptimeRobot/Better Stack), ver `docs/INCIDENT_RUNBOOK.md` |
| Latencia API                  | p95 < 500 ms, p99 < 1,5 s                                                | Métricas de Vercel / Sentry Performance           | **No medido** — sin tráfico real ni prueba de carga todavía                                                 |
| Latencia frontend             | LCP < 2,5 s en 4G móvil                                                  | Lighthouse                                        | **No medido en CI** — se podría agregar `lighthouse-ci` como paso futuro                                    |
| Concurrencia                  | 50 usuarios simultáneos sin degradación                                  | Prueba de carga (`k6`)                            | **No ejecutado** — ver `docs/HALLAZGOS_BLOQUEADOS.md` (A-17/A-14)                                           |
| Volumetría a 3 años           | 50.000 cotizaciones, 10.000 clientes                                     | Dataset de prueba                                 | **No ejecutado** (requiere Postgres real, ver A-14)                                                         |
| RPO / RTO                     | 24 h / 4 h                                                               | Simulacro de restauración                         | Definido en `docs/DR_RUNBOOK.md`, simulacro **pendiente de ejecutar**                                       |
| Retención de datos de negocio | 7 años (obligación tributaria chilena)                                   | Política documentada                              | Ver `docs/CLASIFICACION_DATOS.md`                                                                           |
| Retención de logs             | 90 días                                                                  | Política a implementar en el proveedor de logging | **No implementado** — depende de qué agregador de logs se use (ver C-08)                                    |
| Navegadores soportados        | Últimas 2 versiones de Chrome, Edge, Safari; Safari iOS y Chrome Android | `browserslist` en `frontend/package.json`         | Declarado                                                                                                   |

## Lo que sí se puede afirmar hoy (medido en este repositorio)

- **Bundle inicial**: 71,8 kB gzip (presupuesto interno: 350 kB), verificado en
  cada build por `frontend/scripts/check-bundle-budget.mjs` (A-16).
- **Cobertura de tests backend**: ~46,5% de líneas, con umbral que falla el
  build si baja de eso (`backend/vitest.config.ts`).
- **CI**: tipos + lint + tests + `npm audit` + escaneo de secretos en cada PR
  (`.github/workflows/ci.yml`).

Estos tres son los únicos "SLO" con verificación automática real hoy. El resto
de la tabla de arriba son objetivos a validar y luego instrumentar.

## Próximo paso recomendado

1. Revisar esta tabla con quien tenga contexto de negocio (¿cuántos usuarios
   concurrentes hay realmente? ¿qué tan crítica es la disponibilidad fuera de
   horario laboral?).
2. Configurar el monitor de uptime (bloqueado por acceso a una cuenta externa).
3. Cuando exista una base de datos de staging (`A-08`, bloqueado), correr el
   dataset de volumetría y la prueba de carga (`A-14`, `A-17`) contra ella, no
   contra producción.

## Revisión

Trimestral, junto con el simulacro de `docs/DR_RUNBOOK.md`. Sin responsable
asignado todavía — asignar antes de la primera revisión.
