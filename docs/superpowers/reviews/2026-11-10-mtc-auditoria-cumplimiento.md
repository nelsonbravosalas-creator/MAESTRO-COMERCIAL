# Auditoría de cumplimiento — PR #84 (Mantenciones)

Fecha: 2026-11-10. Alcance: plan `docs/superpowers/plans/2026-11-09-mtc-presentacion-subsistemas.md` y spec `docs/superpowers/specs/2026-11-09-mtc-presentacion-subsistemas-design.md`, contrastados contra el código en `bb5072c`. Solo lectura.

| ID  | Requisito                                                                                      | Origen                               | Evidencia                                                                                                      | Estado     | Tarea que lo cierra             |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------- |
| G1  | Checks "Presentación resumida" y "Cuadro resumen final" en la barra del documento              | Plan T6 Step 5                       | Ningún archivo llama a `patchMtc(` (grep vacío); la barra solo tiene "Mostrar UF/USD" (`Maintenance.tsx:793`)  | Falta      | 2                               |
| G2  | Texto resumido completo en PDF (`print-only`)                                                  | Plan Review Focus 5; T6 Step 4       | Clase `print-only` inexistente en `frontend/src`                                                               | Falta      | 3                               |
| G3  | Bloqueo por estado en la sección IV (textarea, "Restablecer texto")                            | Plan T6 Step 4-5, T6 review          | `MtcValuationSection.tsx`: 0 ocurrencias de `disabled`                                                         | Falta      | 3                               |
| G4  | Columna C1 reemplaza membrete y "Datos del Cliente"                                            | Plan T9 Step 3; spec "Diseño visual" | `Maintenance.tsx:820` (`doc-letterhead`) y `:833` ("Datos del Cliente") siguen presentes junto a `mtcd-side`   | Parcial    | 4                               |
| G5  | Fuentes Source Serif 4 / Source Sans 3; `document.fonts.ready` en PDF                          | Plan T9 Step 4                       | `index.html`: 0 "Source"; `pdfExport.ts`: 0 "fonts.ready"                                                      | Falta      | 4                               |
| G6  | C1 en HTML exportado y banda marina en DOCX                                                    | Plan T9 Steps 5-6                    | 0 referencias a `mtcd`/`0F2440` en `htmlExport.ts`, `docxExport.ts`, `mtcHtml.ts`, `mtcDocx.ts`                | Falta      | 7, 8                            |
| G7  | Sección III con una fila por sistema; equivalentes UF/USD solo con un sistema                  | Plan T6 Step 5 (equivalentes); spec  | Sección III muestra un solo sistema; "Mostrar UF/USD" ya no genera filas en la sección IV                      | Falta      | 3, 4                            |
| G8  | `syncPrimaryMirror` al cargar; test de `loadQuote`                                             | Plan T4 Step 3 y 1                   | `api.ts`: 0 ocurrencias de `syncPrimaryMirror`                                                                 | Falta      | 6                               |
| G9  | Visitas con `visitsFor` en listado y exportadores                                              | Plan T5 Step 6; T7; T8               | `Maintenance.tsx:241,687`, `htmlExport.ts:160`, `docxExport.ts:372` usan `VISITS_PER_YEAR[...]`                | Divergente | 6                               |
| G10 | Tests planeados: documento, bloqueo/único/visitas/`pendingPeriods`, HTML completo, textos DOCX | Plan T5, T6, T7, T8 Step 1           | Sin `Maintenance.document.test.tsx`; sin prueba de bloqueo en `Maintenance.systems.test.tsx`                   | Falta      | 2, 3, 6, 7, 8                   |
| G11 | Revisión independiente de tareas 5 a 9                                                         | Ledger (`progress.md`)               | Solo tareas 1-4 revisadas (OmniRoute y subagente)                                                              | Falta      | 9                               |
| G12 | `graphify update`                                                                              | CLAUDE.md del proyecto               | Rechazado: nodos semánticos faltantes                                                                          | Falta      | 9                               |
| D1  | `id` estable para mantención sin config                                                        | Divergencia introducida (T1)         | `mtcSystems.ts:146-147`: `crypto.randomUUID()` en cada llamada a `ensureMtcConfig`                             | Divergente | 6                               |
| D2  | Panel de sistemas sin bloqueo visual real                                                      | Divergencia introducida (T5)         | `MtcSystemsPanel` usa `fieldset disabled`; `CatalogAutocomplete` no acepta `disabled` (solo bloqueo indirecto) | Parcial    | 3 (verificar en navegador en 5) |

## Requisitos cumplidos (sin acción)

- Modelo `mtc_config`, migración 0028 y validación Zod (T2): cumple; CI de integración verde.
- Acciones del store vía funciones puras y pruebas (T4): cumple salvo G8.
- Panel de valorizaciones, consumibles y pestañas (T5): cumple salvo pruebas de G10.
- `buildMtcDocument`, `mtcMoney`, `mtcValuationSection` (T6): cumple; exporta el modelo correcto.
- Exportaciones HTML y DOCX con sistemas, resumen y consumibles (T7, T8): cumple en contenido, sin estilo C1 (G6).
- Guardia de diseño (`src/__tests__/design`): cumple; colores C1 declarados como tokens en `index.css`.

## Decisiones registradas que se mantienen

- Enfoque A (columna JSON `mtc_config`), no tabla por sistema.
- `summary_mode` y `show_summary_table` en el esquema (spec líneas 82-83).
- `display_currency` no se persiste en backend (defecto previo, fuera de alcance).
- `selectMtcSystem` sin `unsaved` (el índice activo es local).
