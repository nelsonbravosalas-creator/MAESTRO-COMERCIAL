# Mantenciones: auditoría de cumplimiento y cierre de pendientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Al empezar a ejecutar, copiar este archivo a `docs/superpowers/plans/2026-11-10-mtc-auditoria-y-cierre.md` y commitearlo.

## Context

El PR #84 (`claude/maintenance-proposal-check-button-7f9db4`, head `bb5072c`) implementa el plan `docs/superpowers/plans/2026-11-09-mtc-presentacion-subsistemas.md`. Las tareas 3 a 10 se ejecutaron con un modelo externo (OmniRoute) por piezas, sin revisor independiente, y varias se cerraron con requisitos diferidos. El CI está en verde, pero una comprobación de solo lectura del código muestra que faltan requisitos del plan original, incluido el principal:

| #   | Requisito del plan original                                                                                                                            | Estado comprobado en el código                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| G1  | Checks "Presentación resumida" y "Cuadro resumen final" en la barra del documento (Task 6 Step 5)                                                      | **No existen.** Nada en la interfaz llama a `patchMtc`; el modo resumido es inalcanzable para el usuario                   |
| G2  | Texto resumido completo en PDF (`print-only`, Review Focus 5)                                                                                          | No implementado                                                                                                            |
| G3  | Bloqueo por estado en la sección IV (textarea, "Restablecer texto")                                                                                    | `MtcValuationSection.tsx` no tiene ningún `disabled`                                                                       |
| G4  | Diseño C1: la columna reemplaza membrete y "Datos del Cliente" (Task 9 Step 3)                                                                         | Ambos siguen en `Maintenance.tsx:820-833`, duplicados junto a la columna                                                   |
| G5  | Fuentes Source Serif 4 / Source Sans 3 y `document.fonts.ready` en PDF                                                                                 | No cargadas; `pdfExport.ts` no espera fuentes                                                                              |
| G6  | C1 en HTML exportado y banda marina en DOCX (Task 9 Steps 5-6)                                                                                         | 0 referencias a C1 en `htmlExport.ts`, `mtcHtml.ts`, `docxExport.ts`, `mtcDocx.ts`                                         |
| G7  | Sección III con una fila por sistema; equivalentes UF/USD solo con un sistema                                                                          | Sección III muestra solo el Sistema 1; los checks "Mostrar UF/USD" (`Maintenance.tsx:790-803`) ya no producen ninguna fila |
| G8  | `syncPrimaryMirror` al cargar (`api.ts`) y test de `loadQuote` (Task 4)                                                                                | Ausentes                                                                                                                   |
| G9  | Visitas con `visitsFor` en listado y exportadores                                                                                                      | `Maintenance.tsx:241,687`, `htmlExport.ts:160`, `docxExport.ts:372` siguen con `VISITS_PER_YEAR`                           |
| G10 | Tests planeados: `Maintenance.document.test.tsx`, bloqueo/único/visitas/`pendingPeriods` (T5), HTML de exportación completa (T7), textos del DOCX (T8) | No existen                                                                                                                 |
| G11 | Revisión de código independiente de las tareas 5 a 9                                                                                                   | No hecha                                                                                                                   |
| G12 | `graphify update`                                                                                                                                      | Rechazado por nodos semánticos faltantes                                                                                   |

Resultado buscado: una matriz de cumplimiento verificada requisito por requisito, los huecos cerrados en orden de importancia, verificación visual real y el PR listo para mergear.

**Goal:** Auditar el PR #84 contra su spec y su plan, y cerrar todo requisito faltante o defectuoso, con pruebas y verificación en navegador.

**Architecture:** No cambia la arquitectura. Se completa la capa de presentación (barra del documento, sección IV, diseño C1 en pantalla, HTML y DOCX) sobre el modelo ya existente `buildMtcDocument`; la lógica sigue en los módulos puros `mtcSystems`, `mtcActions`, `mtcDocument`, `mtcMoney`.

**Tech Stack:** React + TypeScript + Zustand, Vitest (sin Testing Library: `createRoot` + `act`), `docx`, html2canvas + jsPDF.

**Spec:** `docs/superpowers/specs/2026-11-09-mtc-presentacion-subsistemas-design.md` (incluye "Diseño visual: C1"). Plan original: `docs/superpowers/plans/2026-11-09-mtc-presentacion-subsistemas.md`. Maqueta: `docs/superpowers/mockups/2026-11-09-mtc-estilo-c-sobrio.html` (sección C1).

## Global Constraints

- Se trabaja sobre la rama del PR #84; cada tarea termina en commit y push (Auto-fix está activo; auto-merge apagado).
- Solo `kind='maintenance'`. Cotizaciones de proyecto: sin cambios de comportamiento ni de salida.
- `mtc_config = null` sigue siendo válido: se ve y exporta como una valorización detallada.
- Los archivos tienen fines de línea mixtos (CRLF/LF). Editar con la herramienta Edit, nunca con scripts de reemplazo por bloques; después de cada edición correr `npx tsc -b`.
- Tests de componentes: `createRoot` + `act` + `container.querySelector`, patrón de `frontend/src/pages/__tests__/Maintenance.systems.test.tsx`. Fixtures con `as unknown as MasterQuotation`.
- Colores en CSS: solo `var(--token)`. Los tokens C1 ya están en `frontend/src/index.css` (`--mtcd-c-0f2440`, `-1c2533`, `-6b5a22`, `-b9c4d6`, `-c9a94f`, `-e3cf8f`, `-eef1f6`, `-ffffff`); la guardia `src/__tests__/design` no admite colores literales nuevos en CSS ni en TSX.
- Backend: `npx tsc --noEmit` (no solo `tsconfig.build.json`): el CI compila también los tests. No usar `Array.prototype.at`.
- Regla de bloqueo: `LOCKED_STATUSES.includes(q.status) && role !== 'admin'`, con `LOCKED_STATUSES` de `frontend/src/pages/Quotations.tsx:66` y `role` de `usePermissions()`.
- Frecuencias válidas: `mensual`, `bimestral`, `trimestral`, `cuatrimestral`, `semestral`, `anual`, `especial`, `unico`.
- Implementación y revisión con subagentes de Claude (no OmniRoute): la ejecución anterior mostró que el modelo externo confunde firmas.

## Review Focus

1. **Usuario marca "Presentación resumida", edita el texto y exporta PDF**: el PDF muestra el texto completo editado, no un textarea recortado. Test en Task 3; verificación visual en Task 5.
2. **Cotización Adjudicada con rol no admin**: no puede cambiar checks, texto ni restablecer. Test en Task 2 y Task 3.
3. **Mantención anterior al cambio (`mtc_config` nulo) abierta sin tocar nada**: documento, HTML y DOCX muestran los mismos montos que antes del PR. Test en Task 3 y Task 7.
4. **Régimen Especial o Único en el Sistema 1**: listado, sección III y exportadores muestran las visitas correctas (no 1 fijo). Test en Task 6.
5. **Tres sistemas con monedas distintas, documento de varias páginas**: la columna marina llega al final en PDF y las tablas no se desbordan en DOCX. Verificación en Task 5 y Task 8.

---

### Task 1: Auditoría de cumplimiento (solo lectura)

**Files:**

- Create: `docs/superpowers/reviews/2026-11-10-mtc-auditoria-cumplimiento.md`

**Interfaces:**

- Produces: la matriz que las tareas 2 a 9 usan como lista de trabajo; cada hallazgo nuevo lleva un id `A-n` y la tarea que lo absorbe.

- [ ] **Step 1: Recorrer el plan original tarea por tarea** (Tasks 1 a 10) y, por cada Step y cada línea de "Interfaces / Produces", buscar la evidencia en el código (`ruta:línea`) o en un test. Recorrer igual cada sección de la spec y cada línea de "Global Constraints" y "Review Focus" del plan original.

- [ ] **Step 2: Escribir la matriz** con columnas: Requisito (cita breve) · Origen (plan Task/Step o sección de spec) · Evidencia (`ruta:línea` o "ninguna") · Estado (Cumple / Parcial / Falta / Divergente) · Tarea de este plan que lo cierra. Partir de G1 a G12 de la sección Context, confirmarlos y agregar lo que aparezca.

- [ ] **Step 3: Revisar divergencias introducidas**, no solo ausencias: `ensureMtcConfig` genera un id nuevo en cada llamada para mantenciones sin config (`mtcSystems.ts:167`); controles sin estilo en `MtcSystemsPanel.tsx` / `MtcConsumablesEditor.tsx`; `CatalogAutocomplete` sin bloqueo real; decisiones registradas en `.superpowers/sdd/2026-11-09-mtc-presentacion-subsistemas/progress.md` (líneas con `Ruling:`).

- [ ] **Step 4: Verificación.** Todo requisito del plan original tiene fila; ninguna fila "Falta/Parcial/Divergente" queda sin tarea asignada. Si aparece un hallazgo que no cabe en las tareas 2 a 9, agregarlo a la lista de la Task 9.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/reviews/2026-11-10-mtc-auditoria-cumplimiento.md docs/superpowers/plans/2026-11-10-mtc-auditoria-y-cierre.md
git commit -m "docs(mantenciones): auditoria de cumplimiento del PR 84 y plan de cierre"
```

---

### Task 2: Controles de presentación en la barra del documento (G1, G7)

**Files:**

- Create: `frontend/src/pages/maintenance/MtcDocumentToolbar.tsx`
- Modify: `frontend/src/pages/Maintenance.tsx:786-812` (barra de `TabDocumentoMtc`)
- Test: `frontend/src/pages/__tests__/Maintenance.document.test.tsx`

**Interfaces:**

- Consumes: `useMaestro().patchMtc(fields: { summary_mode?: boolean; show_summary_table?: boolean })`, `patchActive`, `ensureMtcConfig(q): MtcConfig`.
- Produces: `<MtcDocumentToolbar disabled={boolean} />` — renderiza los checks "Presentación resumida", "Cuadro resumen final" y, **solo si hay un único sistema**, los actuales "Mostrar UF" / "Mostrar USD" con su campo "USD ref." (se mueven aquí desde `Maintenance.tsx`).

- [ ] **Step 1: Write the failing tests** (`describe('MtcDocumentToolbar')`):
  - Con una mantención de un sistema: existen los checks con texto "Presentación resumida" y "Cuadro resumen final", ambos sin marcar; existen "Mostrar UF" y "Mostrar USD".
  - Click en "Presentación resumida" → `mtc_config.summary_mode === true` en el store y `unsaved === true`; segundo click → `false`.
  - Click en "Cuadro resumen final" → `mtc_config.show_summary_table === true`.
  - Con `mtc_config: null`, el primer click materializa la configuración con un sistema y `summary_mode true`.
  - Con dos sistemas no se muestran "Mostrar UF" ni "Mostrar USD".
  - Con `disabled`, todos los checks tienen el atributo `disabled`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Maintenance.document.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `MtcDocumentToolbar`** con `<label className="mtc-currency-toggle">` + `<input type="checkbox">`, igual que los checks actuales, y montarlo en la barra de `TabDocumentoMtc` en lugar del bloque de `Maintenance.tsx:788-812`. En `TabDocumentoMtc` calcular `isLocked` con la regla de Global Constraints y pasarlo como `disabled`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src/pages`
Expected: PASS, 0 errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/maintenance/MtcDocumentToolbar.tsx frontend/src/pages/Maintenance.tsx frontend/src/pages/__tests__/Maintenance.document.test.tsx
git commit -m "feat(mantenciones): checks de presentacion resumida y cuadro resumen en el documento"
```

---

### Task 3: Sección IV completa — texto para PDF, bloqueo y equivalentes (G2, G3, G7)

**Files:**

- Modify: `frontend/src/pages/maintenance/MtcValuationSection.tsx`
- Modify: `frontend/src/styles/MtcDocument.css`
- Modify: `frontend/src/pages/Maintenance.tsx` (pasar `disabled`)
- Test: `frontend/src/pages/__tests__/Maintenance.document.test.tsx` (nuevo `describe('MtcValuationSection')`)

**Interfaces:**

- Consumes: `buildMtcDocument(q, expandedCats): MtcDocumentModel` (`frontend/src/utils/mtcDocument.ts`), `patchMtcSystem(index, { summary_text })`, `formatMtcMoney(clp, { uf, usd }, currency)` (`mtcMoney.ts`), `grandSummary(q)`.
- Produces: `<MtcValuationSection expandedCats onToggleCat disabled={boolean} />` (prop nueva `disabled`).

- [ ] **Step 1: Write the failing tests**:
  - Modo detallado (config por defecto): se ven las filas de categoría y el texto "TOTAL POR VISITA CON IVA"; no hay `textarea`.
  - Modo resumido: columnas "Ítem", "Cant.", "Descripción", "Precio unit.", "Precio total"; un `textarea[aria-label="Texto de la descripción del servicio"]` con el texto por defecto bimestral de la spec; junto a él un `.print-only` cuyo `textContent` es el mismo texto.
  - Escribir en el textarea → `summary_text` guardado; aparece el botón "Restablecer texto"; el `.print-only` contiene el texto nuevo completo (probar con 12 líneas); click en "Restablecer texto" → `summary_text === null`.
  - Con `disabled`: el textarea y "Restablecer texto" tienen `disabled`.
  - Dos sistemas → títulos que empiezan con "IV.1" e "IV.2".
  - `show_summary_table: true` → "Resumen de valores anuales" y "TOTAL ANUAL CON IVA".
  - Mantención con `mtc_config: null`, `uf: 39500`, `show_uf_equivalent: true` → aparece una fila "Equivalente en UF" con `(total anual con IVA / 39500).toFixed(2) + ' UF'`; con dos sistemas no aparece (Review Focus 3).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Maintenance.document.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar.** En la fila resumida: `<textarea className="mtc-summary-input" disabled={disabled} …>` seguido de `<div className="print-only" style={{ whiteSpace: 'pre-line' }}>{text}</div>`. Botón con `disabled`. Filas "Equivalente en UF / USD" tras los totales anuales cuando `model.blocks.length === 1 && !block.isUnique`, con las mismas condiciones y textos que tenía `TabDocumentoMtc` antes del PR (`git show 515978e:frontend/src/pages/Maintenance.tsx`, líneas 1064-1075).

- [ ] **Step 4: CSS** en `MtcDocument.css` (sin colores literales): `.print-only { display: none }`, `.pdf-exporting .print-only { display: block }`, `.pdf-exporting .mtc-summary-input { display: none }`, y las mismas dos reglas dentro de `@media print`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src/pages`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/maintenance/MtcValuationSection.tsx frontend/src/styles/MtcDocument.css frontend/src/pages/Maintenance.tsx frontend/src/pages/__tests__/Maintenance.document.test.tsx
git commit -m "feat(mantenciones): texto resumido imprimible, bloqueo y equivalentes en la seccion IV"
```

---

### Task 4: Diseño C1 completo en pantalla (G4, G5, G7)

**Files:**

- Modify: `frontend/src/pages/Maintenance.tsx:816-905` (membrete, "Datos del Cliente", sección III) y pie del documento
- Modify: `frontend/src/pages/maintenance/MtcDocumentSide.tsx`
- Modify: `frontend/src/styles/MtcDocument.css`
- Modify: `frontend/index.html`, `frontend/src/utils/pdfExport.ts`
- Test: `frontend/src/pages/__tests__/MtcDocumentSide.test.tsx`, `frontend/src/pages/__tests__/Maintenance.document.test.tsx`

**Interfaces:**

- Consumes: `grandSummary(q): { rows: { label, net }[]; net; iva; total }`, `quotationContact(q, client)` (`utils/contacts.ts`), `systemTotals(q, i)`, `MTC_FREQUENCY_LABELS`.
- Produces: `<MtcDocumentSide contactName={string} />`.

- [ ] **Step 1: Write the failing tests**:
  - `MtcDocumentSide`: muestra "Atención" con el contacto recibido; el bloque "Resumen anual" lista una línea por fila de `grandSummary(q).rows` más "IVA (19%)" y "Total anual con IVA" **aunque `show_summary_table` sea `false`**; con dos sistemas muestra dos líneas de servicio.
  - Documento (`TabDocumentoMtc` montado con el patrón de `Quotations.test.tsx`): no existe `.doc-letterhead`; no existe el título "Datos del Cliente"; existe una tabla compacta con RUT, Cargo, Correo y "Elaborado por"; la sección III tiene una fila por sistema (nombre, régimen, visitas/año) cuando hay más de uno.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/MtcDocumentSide.test.tsx src/pages/__tests__/Maintenance.document.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar la estructura.** Quitar de `.mtcd-main` el bloque `doc-letterhead` + `doc-accent-rule` y la tabla "Datos del Cliente"; dejar al inicio del cuerpo una tabla compacta (`doc-client-table`) con RUT, Cargo, Correo, Usuario final (si existe) y "Elaborado por". Sección III: una fila por sistema con `MTC_FREQUENCY_LABELS[sys.frequency]` y `systemTotals(q, i).visits`; la fila "Vigencia" se conserva. Columna: agregar "Atención" y el resumen anual descrito en el test. Pie: datos de la empresa + "Firma y timbre" como en la maqueta.

- [ ] **Step 4: Tipografía y PDF.** En `index.html`, `<link>` de Google Fonts para Source Serif 4 (400, 600) y Source Sans 3 (400, 600, 700), con `preconnect`. En `pdfExport.ts`, `await document.fonts.ready` antes de `html2canvas`. Estilos restantes de la spec en `MtcDocument.css`: rótulos de 10,5 px con `letter-spacing: .14em`, cifras con `font-variant-numeric: tabular-nums`, totales en tabla de 300 px alineada a la derecha con fila final `var(--mtcd-c-eef1f6)`, sin sombras ni bordes redondeados; estilos para los controles de `MtcSystemsPanel` y `MtcConsumablesEditor` (hoy sin clases con estilo) reutilizando `base-row` / `base-input` de la pantalla.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src && npm run build`
Expected: PASS, guardias de diseño incluidas, bundle dentro de presupuesto.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Maintenance.tsx frontend/src/pages/maintenance/MtcDocumentSide.tsx frontend/src/styles/MtcDocument.css frontend/index.html frontend/src/utils/pdfExport.ts frontend/src/pages/__tests__
git commit -m "feat(mantenciones): estructura C1 completa en el documento, fuentes y seccion III por sistema"
```

---

### Task 5: Verificación visual en navegador

**Files:**

- Create: `docs/superpowers/reviews/2026-11-10-mtc-verificacion-visual.md` (capturas enlazadas y hallazgos)

**Interfaces:**

- Consumes: Tasks 2 a 4. Los defectos visuales que aparezcan se corrigen en esta misma tarea (CSS / marcado) con su commit.

- [ ] **Step 1: Levantar el entorno** con `preview_start` (configuración en `.claude/launch.json`; si no existe, crearla para el frontend en modo JSON-dev, `npm run dev:json`, y el backend `server-dev`). Revisar `read_console_messages` sin errores.

- [ ] **Step 2: Recorrido 1 — mantención nueva, un sistema.** Base: régimen Bimestral, horario hábil, consumibles con dos filas. Documento: marcar "Presentación resumida" y "Cuadro resumen final"; editar el texto; "Restablecer texto". Comparar contra la sección C1 de la maqueta; captura en ambas presentaciones.

- [ ] **Step 3: Recorrido 2 — tres sistemas** (uno Único, uno Especial cada 5 meses, monedas CLP/UF/USD, consumibles en dos). Costear cada sistema desde las pestañas de sistema; guardar; recargar la página; comprobar que cada costeo vuelve en su sistema. Captura del documento completo.

- [ ] **Step 4: Recorrido 3 — mantención anterior al PR** (crear una fila con `mtc_config` nulo en el backend de desarrollo). Abrir sin editar: mismos montos que en `master`.

- [ ] **Step 5: Exportaciones.** PDF con texto editado de más de 10 líneas (texto completo, columna marina hasta el final, fuentes correctas); HTML; DOCX. Ancho de 375 px con `resize_window`: la columna pasa arriba y no hay desplazamiento horizontal de página.

- [ ] **Step 6: Registrar** capturas y resultado por recorrido en el archivo de revisión; enviar las capturas al usuario con `SendUserFile`. Commit de correcciones y del archivo:

```bash
git add docs/superpowers/reviews/2026-11-10-mtc-verificacion-visual.md frontend/src
git commit -m "fix(mantenciones): ajustes de la verificacion visual del documento C1"
```

---

### Task 6: Espejo del Sistema 1, carga y visitas (G8, G9)

**Files:**

- Modify: `frontend/src/api/api.ts:~535-560` (`toMasterQuotation`)
- Modify: `frontend/src/utils/mtcSystems.ts:167` (`ensureMtcConfig`)
- Modify: `frontend/src/pages/Maintenance.tsx:241,687`, `frontend/src/utils/htmlExport.ts:160`, `frontend/src/utils/docxExport.ts:372`
- Test: `frontend/src/stores/__tests__/maestro-mtc.test.ts`, `frontend/src/utils/__tests__/mtcSystems.test.ts`, `frontend/src/pages/__tests__/Maintenance.systems.test.tsx`

**Interfaces:**

- Consumes: `syncPrimaryMirror(q): MasterQuotation`, `visitsFor(frequency, specialMonths): number`.
- Produces: `primaryVisits(q: MasterQuotation): number` exportada desde `mtcSystems.ts` = `visitsFor` del Sistema 1 con su `special_months` (0 si `q.frequency` es nulo y no hay config).

- [ ] **Step 1: Write the failing tests**:
  - `primaryVisits`: Sistema 1 `especial` con `special_months 5` → 2; `unico` → 1; `bimestral` → 6; sin config y `frequency: 'trimestral'` → 4; sin config y `frequency: null` → 0.
  - `ensureMtcConfig` sobre la misma cotización sin config, llamada dos veces → `systems[0].id` idéntico (id determinista `'sys-1'`).
  - Store: `loadQuote(id)` con el sistema 2 activo localmente → tras hidratar, `mtc_active_system === 0` y `items` son los del Sistema 1 (mock de `api.getQuotation`).
  - Mapeo: una fila del servidor con `frequency: 'mensual'` pero `mtc_config.systems[0].frequency: 'bimestral'` y `currency: 'UF'` → tras `toMasterQuotation`, `frequency 'bimestral'`, `visits_per_year 6`, `display_currency 'UF'`.
  - `pendingPeriods` (ya exportable) → `null` con `frequency: 'unico'`.
  - Panel: mantención `Adjudicada` con rol no admin → campos y botones de `MtcSystemsPanel` con `disabled`; los botones de `MtcSystemTabs` no.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/mtcSystems.test.ts src/stores/__tests__/maestro-mtc.test.ts src/pages/__tests__/Maintenance.systems.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** `primaryVisits`, el id determinista, `syncPrimaryMirror` en `toMasterQuotation` cuando existe `mtc_config.systems[0]`, y reemplazar las cuatro expresiones `q.visits_per_year ?? VISITS_PER_YEAR[...]` por `primaryVisits(q)`. Exportar `pendingPeriods` desde `Maintenance.tsx` si aún no lo está.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/api.ts frontend/src/utils/mtcSystems.ts frontend/src/pages/Maintenance.tsx frontend/src/utils/htmlExport.ts frontend/src/utils/docxExport.ts frontend/src/stores/__tests__ frontend/src/utils/__tests__ frontend/src/pages/__tests__
git commit -m "fix(mantenciones): espejo del sistema 1 al cargar, id estable y visitas por regimen"
```

---

### Task 7: Exportación HTML — C1 y pruebas de documento completo (G6, G10)

**Files:**

- Modify: `frontend/src/utils/htmlExport.ts` (rama `isMtc`: estructura y `<style>`)
- Modify: `frontend/src/utils/mtcHtml.ts` (si hace falta la sección III por sistema)
- Test: `frontend/src/utils/__tests__/htmlExport.mtc.test.ts`

**Interfaces:**

- Consumes: `mtcValuationHtml(q, expandedCategoryIds, esc)`, `grandSummary(q)`, `formatMtcMoney`.
- Produces: `buildHtml(params): string` exportada desde `htmlExport.ts` (extraída de `downloadHtml`, que pasa a llamarla y a descargar el resultado).

- [ ] **Step 1: Write the failing tests** sobre `buildHtml`:
  - Dos sistemas, consumibles en el primero, `summary_mode: true`, `show_summary_table: true` → contiene "IV.1", "IV.2", el texto por defecto con el salto de línea como `<br>`, `$16.889`, "Resumen de valores anuales"; no contiene "Mano de Obra Especializada". Con `summary_mode: false` sí la contiene.
  - Mantención con `mtc_config: null` → contiene los montos de subtotal, IVA y total por visita y anuales calculados con `calcTotals` y `fmtCLP` (Review Focus 3).
  - `summary_text` con `<script>` → aparece `&lt;script&gt;`.
  - C1: contiene `mtcd-side`, `#0f2440`, "Source Serif 4" y `print-color-adjust: exact`; el HTML de una cotización de proyecto no contiene `mtcd-` y es idéntico al de `master` para el mismo dato de entrada (comparar con una instantánea generada antes de modificar el archivo).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/htmlExport.mtc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar.** Extraer `buildHtml`. En la rama `isMtc`: estructura `mtcd-wrap` / `mtcd-side` / `mtcd-main` con el mismo contenido que la pantalla (Task 4), estilos C1 embebidos con los valores hex de la spec (en HTML exportado los literales son correctos: no pasa por la guardia de CSS), `<link>` de Google Fonts con pilas de respaldo `Georgia, serif` y `'Segoe UI', Arial, sans-serif`, y `@media print`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/htmlExport.ts frontend/src/utils/mtcHtml.ts frontend/src/utils/__tests__/htmlExport.mtc.test.ts
git commit -m "feat(mantenciones): exportacion HTML con diseño C1 y pruebas de documento completo"
```

---

### Task 8: Exportación DOCX — banda C1 y pruebas de contenido (G6, G10)

**Files:**

- Modify: `frontend/src/utils/mtcDocx.ts`, `frontend/src/utils/docxExport.ts` (rama `isMtc`)
- Test: `frontend/src/utils/__tests__/docxExport.mtc.test.ts`

**Interfaces:**

- Consumes: `buildMtcValuationChildren(model)`, `buildMtcDocument(q, expanded)`.
- Produces: `buildMtcHeaderBand(q: MasterQuotation, contactName: string): Table` en `mtcDocx.ts`; `buildDocxDocument(params): Document` exportada desde `docxExport.ts` (extraída de `downloadDocx`).

- [ ] **Step 1: Write the failing tests**: con el dato de dos sistemas de la Task 7, `Packer.toBuffer(buildDocxDocument(params))` resuelve; descomprimir `word/document.xml` (con `jszip`, ya dependencia de `docx`; si no resuelve como import, serializar con `new Formatter().format(doc.Document.View.Body)` de `docx`) y afirmar que el XML contiene "IV.1", "IV.2", "16.889", "Resumen de valores anuales", el sombreado `0F2440` y la fuente `Georgia`; para una cotización de proyecto el XML no contiene `0F2440`. En modo resumido la tabla del servicio tiene 5 celdas en la primera fila; consumibles agrega tablas de 7 y 5 columnas.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/docxExport.mtc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** según la spec ("DOCX", supuesto S9): banda superior de ancho completo (tabla de una fila, sombreado `0F2440`, texto blanco, borde inferior `C9A94F`) con título, N° de documento, fecha, cliente y referencia, que reemplaza al membrete en la rama `isMtc`; encabezados de tabla con sombreado `0F2440`; fila final de totales `EEF1F6`; fuentes `Georgia` (títulos) y `Calibri` (cuerpo).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Revisión manual.** Descargar el DOCX de tres sistemas desde la app y entregarlo al usuario con `SendUserFile` para abrirlo en Word: tablas dentro del ancho de página, banda visible.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/mtcDocx.ts frontend/src/utils/docxExport.ts frontend/src/utils/__tests__/docxExport.mtc.test.ts
git commit -m "feat(mantenciones): banda C1 en DOCX y pruebas de contenido"
```

---

### Task 9: Revisión de código de toda la rama y cierre (G11, G12)

**Files:**

- Create: `docs/superpowers/reviews/2026-11-10-mtc-revision-final.md`
- Modify: lo que la revisión exija; `graphify-out/`

- [ ] **Step 1: Paquete de revisión.** `git diff $(git merge-base origin/master HEAD)..HEAD` a un archivo; despachar un revisor en el modelo más capaz con la spec, los dos planes, la matriz de la Task 1 y la lista de menores diferidos del ledger (`.superpowers/sdd/2026-11-09-mtc-presentacion-subsistemas/progress.md`). Pedir veredicto de cumplimiento de spec y de calidad, con `ruta:línea`.

- [ ] **Step 2: Una sola ronda de corrección** con todos los hallazgos Críticos e Importantes, seguida de una re-revisión acotada al diff de corrección. Los menores no corregidos quedan listados en el archivo de revisión con su motivo.

- [ ] **Step 3: Suites completas**

Run: `cd backend && npx vitest run && npx eslint . && npx tsc --noEmit`
Run: `cd frontend && npx vitest run && npx eslint . && npm run build`
Expected: todo en verde.

- [ ] **Step 4: Grafo.** `graphify update .` falla con "saved semantic node(s) are missing": leer `~/.claude/skills/graphify/SKILL.md` para la opción de reconstrucción que conserva los nodos semánticos; si exige regenerarlos con costo de API, no ejecutarla y dejarlo anotado para el usuario.

- [ ] **Step 5: Actualizar la matriz** de la Task 1 (todas las filas en "Cumple" o con excepción explicada), actualizar la descripción del PR #84 quitando los pendientes cerrados, commit y push.

```bash
git add docs/superpowers/reviews frontend backend graphify-out
git commit -m "docs(mantenciones): revision final y matriz de cumplimiento cerrada"
git push origin claude/maintenance-proposal-check-button-7f9db4
```

---

## Verification

- **Automática:** backend `npx vitest run` (651 + nuevos) y `npx tsc --noEmit`; frontend `npx vitest run` (176 + nuevos), `npx tsc -b`, `npx eslint .`, `npm run build`; CI del PR #84 en verde tras cada push.
- **Funcional (Task 5):** tres recorridos en navegador con capturas: un sistema, tres sistemas con monedas y regímenes mixtos, y mantención anterior al PR; guardar y recargar; PDF, HTML y DOCX.
- **De cumplimiento:** la matriz `docs/superpowers/reviews/2026-11-10-mtc-auditoria-cumplimiento.md` sin filas "Falta" ni "Parcial" sin justificar.
- **Humana:** el usuario abre el DOCX en Word y confirma el diseño C1 contra la maqueta antes de mergear.
