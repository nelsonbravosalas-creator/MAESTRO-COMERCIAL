# Plan maestro de pendientes — MAESTRO-COMERCIAL (2026-11-22)

> v2. Borrador de Claude revisado por Gemini (Gemini 4 Neon High) y vuelto a verificar contra el repo. Al final está qué se aceptó y qué se descartó de la crítica.

## Diagnóstico de partida (verificado hoy)

- **Backup diario:** falla todas las noches. El log del 22-11 dice `E: Unable to locate package postgresql-client-15`: el runner ya es Ubuntu 26.04 y Neon corre Postgres 17. Los 5 secrets existen. El PR #35 instala el cliente 17 desde PGDG, pero se escribió para Ubuntu 24.04.
- **PR #86** (saltos de página y logo): CI verde, mergeable. Toca `Maintenance.tsx`, `MtcDocumentSide.tsx`, `htmlExport.ts`, `docxExport.ts` y `pdfExport.ts`, los mismos archivos de las tareas 7 y 8 del cierre de Mantenciones.
- **Dependabot npm:** #87 (frontend) falla `quality (frontend)`; #85 (backend) falla `quality`, `vercel-function` e `integration`; #81 (raíz) falla `vercel-function`. **Dependabot Actions:** #74, #75, #59.
- **Tests de integración:** el job `integration` de CI ya corre contra un Postgres real, pero en la versión 15 (`postgres:15-alpine`), y producción es 17.
- **Cierre de Mantenciones:** tareas 1 a 4 hechas; 5 a 9 sin commits.
- **Bot cubicador:** completo; quedan 3 observaciones y valores por calibrar.

## Principios

1. Primero lo que protege datos, después lo que desbloquea archivos compartidos, después funcionalidad.
2. Un cambio por PR con CI verde y verificación real (correr, no solo leer).
3. Nada contra la base Neon de producción sin respaldo verificado: la comparte el bot de Subcontrataley. Los ensayos van en una branch efímera de Neon.
4. Las decisiones de negocio se piden antes de diseñar.
5. Atender CVE altos o críticos en cuanto aparezcan, aunque rompan el orden.

## Fase 0 — Red de seguridad (hoy, ~1–2 h)

| #   | Tarea                                                                                                                                                                                                                                                                                                                                                           | Hecho cuando                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0.1 | Confirmar la versión real con `SHOW server_version;` en Neon.                                                                                                                                                                                                                                                                                                   | Versión anotada en `docs/DR_RUNBOOK.md`                                                   |
| 0.2 | Rehacer #35 sin depender del sistema del runner: correr `pg_dump`/`pg_restore` con `docker run postgres:<versión Neon>` y dejar el AWS CLI en el runner (una imagen `postgres` no trae `aws`, por eso no sirve `container:` para todo el job). Definir si el dump incluye las tablas del bot de Subcontrataley (hoy sí, porque vuelca toda la base) y anotarlo. | `gh workflow run backup.yml` verde, dump > 0, `pg_restore --list` OK, objeto en el bucket |
| 0.3 | Revisar en el bucket: retención aplicada y cifrado en reposo activado.                                                                                                                                                                                                                                                                                          | Anotado en el runbook                                                                     |
| 0.4 | Cerrar el issue #34 con el run verde enlazado.                                                                                                                                                                                                                                                                                                                  | Issue cerrado                                                                             |
| 0.5 | Simulacro de restauración cronometrado en una branch efímera de Neon.                                                                                                                                                                                                                                                                                           | Tiempo anotado en el runbook                                                              |
| 0.6 | Ver qué roles usan la app y el bot en Neon: si comparten rol y permisos sobre todas las tablas, crear un rol por sistema con permisos solo sobre sus tablas.                                                                                                                                                                                                    | Roles separados o riesgo aceptado por escrito                                             |

## Fase 1 — Despejar lo que bloquea (~1 h)

| #   | Tarea                                                                                                        | Hecho cuando    |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| 1.1 | Verificar #86 en el preview de Vercel (PDF de cotización y de mantención, logo) y mergear.                   | Merge en master |
| 1.2 | Cerrar #3 y #4 (julio, sin vigencia) con comentario.                                                         | Cerrados        |
| 1.3 | Subir el job `integration` de CI a `postgres:17-alpine`, para probar contra la misma versión que producción. | CI verde        |

## Fase 2 — Terminar Mantenciones (plan 2026-11-10, tareas 5 a 9) (~1 día)

Requiere 1.1 mergeado y la rama rebasada.

| #   | Tarea                                                                                                                    | Hecho cuando           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 2.1 | Task 6: espejo del Sistema 1, carga y visitas (G8, G9).                                                                  | Tests unitarios verdes |
| 2.2 | Task 7: exportación HTML con C1 (G6, G10). Tests con aserciones de estructura y contenido clave, no snapshots completos. | Tests verdes           |
| 2.3 | Task 8: exportación DOCX con banda C1 (G6, G10), mismo criterio de tests.                                                | Tests verdes           |
| 2.4 | Task 5: verificación visual en el navegador (pantalla, PDF, HTML, DOCX).                                                 | Capturas en el PR      |
| 2.5 | Task 9: revisión de código de la rama, cierre de G11/G12.                                                                | PR mergeado            |

## Fase 3 — Dependencias (~1–2 h)

| #   | Tarea                                                                                                                                                      | Hecho cuando                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 3.1 | Un solo PR con #74 (checkout v7), #75 (gitleaks v3) y #59 (setup-node). Para gitleaks v3, leer las notas de versión por cambios de licencia o de entradas. | CI verde una vez; los tres cerrados      |
| 3.2 | Leer la falla de #81, #85 y #87; arreglar lo que sea de código y dejar fuera los majors que rompan.                                                        | Los tres cerrados con merge o con motivo |
| 3.3 | En `dependabot.yml`, agrupar solo patch y minor; los majors, en PR aparte o ignorados con motivo.                                                          | Menos PRs rotos por semana               |

## Fase 4 — Precio unitario agrupado y tarjeta "Contexto de obra" (~2 días)

Bloqueado por 2 decisiones del usuario: cómo se agrupan las partidas y cómo se redondea el precio unitario.

| #   | Tarea                                                                                                                                                                                                                                                                                                                                     | Hecho cuando                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 4.1 | Entrevista corta (AskUserQuestion) para agrupación y redondeo.                                                                                                                                                                                                                                                                            | Decisiones en el spec                                       |
| 4.2 | Spec y plan en `docs/superpowers/`.                                                                                                                                                                                                                                                                                                       | Plan aprobado                                               |
| 4.3 | Migración: columna JSONB `work_context` en `quotations`, ensayada en una branch efímera de Neon antes de producción. Aplicar también en `server-dev.ts` (sigue siendo un backend paralelo, ver Descartes).                                                                                                                                | Migración aplicada y verificada con `pgmigrations`          |
| 4.4 | Estilo "unitario agrupado" en vista previa y PDF, para los dos `kind`.                                                                                                                                                                                                                                                                    | El total exacto se mantiene en los tests                    |
| 4.5 | Tarjeta con 5 entradas y botón "Analizar contexto": Gemini vía `llm.ts` con timeout explícito (`AbortController`) y límite de llamadas por usuario; `scrubPii()` antes de enviar, ampliado a direcciones de obra y nombres; aviso en pantalla de que el texto se envía a un tercero; logs sin el texto crudo; tabla de ejemplos few-shot. | Test con PII de prueba que no llega al LLM; test de timeout |

## Fase 5 — Calibrar el cubicador (~medio día + datos del usuario)

| #   | Tarea                                                            | Hecho cuando                        |
| --- | ---------------------------------------------------------------- | ----------------------------------- |
| 5.1 | Decidir la regla de nitrógeno (uniones o soldaduras) y unificar. | Una sola fórmula, golden set verde  |
| 5.2 | Texto de salida del cilindro de motor.                           | Aparece en la tarjeta               |
| 5.3 | Calibrar HH y la placa de 4,0 kg con 3–5 obras reales cerradas.  | Parámetros en BD con fuente anotada |
| 5.4 | `graphify update .` y revisar los 2 nodos faltantes.             | Nodos presentes                     |

## Fase 6 — Infraestructura con acceso externo (cuando el usuario dé acceso)

Orden: A-08 (staging con branch de Neon + entorno de Vercel) → A-15 (Playwright contra staging) → A-09 (CD con rollback) → A-18 (PITR de Neon). A-14 queda cubierto por el job `integration` (ver 1.3); solo falta reflejarlo en `HALLAZGOS_BLOQUEADOS.md`.

## Fase 7 — Multi-empresa (decisión antes de código)

| #   | Tarea                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- |
| 7.1 | Decidir aislamiento lógico (`tenant_id` por fila) o legal (esquema o base por empresa).                   |
| 7.2 | Mover el bot de Subcontrataley a su propia base antes de migrar.                                          |
| 7.3 | Migración `tenant_id` + índices compuestos `(tenant_id, deleted_at)` + RLS opcional, ensayada en staging. |
| 7.4 | Paginación real en lugar del tope de 500 filas; rate limit por empresa.                                   |

Depende de la Fase 0 (respaldo verificado) y de A-08 (staging).

## Fase 8 — Roadmap (después de la 7, por valor)

1. Ciclo cotización-a-cobro: cierre con OC → cobranza y riesgo → simulador de negociación → contratos de mantención → catálogo con precios web.
2. Motores de alta complejidad: priorizarlos con datos reales cuando el cierre con OC genere historial.

## Continuo

- Bajar warnings de ESLint (`no-explicit-any`) en cada PR que toque un archivo, y bajar el tope del CI al nuevo conteo.

## Qué cambió con la crítica de Gemini

**Aceptado:**

- Backup con la imagen oficial `postgres` en vez de paquetes del sistema del runner (ajustado: solo para `pg_dump`/`pg_restore`, porque la imagen no trae AWS CLI).
- Verificar la versión de Neon, el alcance del dump, la retención y el cifrado del bucket.
- Dependabot npm después de Mantenciones, salvo CVE altos.
- Agrupar los 3 PRs de Actions en uno; revisar gitleaks v3.
- Aserciones de contenido en lugar de snapshots para HTML y DOCX.
- Solo patch/minor agrupados en `dependabot.yml`.
- Timeout, límite de llamadas, aviso al usuario y logs limpios para la llamada a Gemini; `scrubPii()` más amplio.
- Branch efímera de Neon para ensayar migraciones sin esperar el staging completo.
- Bajar el riesgo de la base compartida ya (roles separados, 0.6) y no esperar a multi-empresa.

**Corregido o descartado:**

- "Adelantar A-14": en la práctica ya está hecho; el job `integration` corre contra Postgres real. Lo que faltaba era la versión (15 contra 17), y eso queda en 1.3.
- "Límite de 10–60 s en Vercel": el límite por defecto hoy es 300 s. El timeout explícito se mantiene igual, por costo y por la experiencia de usuario.
- "Eliminar `server-dev.ts` con un wrapper de 5 líneas": no es un wrapper. Es un backend aparte con datos en archivos JSON para desarrollar sin Postgres. Reemplazarlo es un proyecto propio, fuera de este plan.
