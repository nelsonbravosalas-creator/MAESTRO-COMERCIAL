# Mantenciones: presentación resumida, subsistemas y consumibles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una cotización de mantención pueda presentarse resumida, con varias valorizaciones (cada una con costeo, régimen, horario y moneda propios), repuestos consumibles opcionales y un cuadro resumen final.

**Architecture:** Una columna JSONB `quotations.mtc_config` guarda la configuración de presentación y los sistemas; el Sistema 1 conserva su costeo en las tablas actuales y los demás lo llevan dentro del JSON. Toda la lógica (visitas, texto, consumibles, totales, intercambio de costeo) vive en un módulo puro `frontend/src/utils/mtcSystems.ts`, que consumen la pantalla y los exportadores. El backend solo valida y transporta el JSON.

**Tech Stack:** React + TypeScript + Zustand (frontend), Express + Zod + PostgreSQL con node-pg-migrate (backend), Vitest en ambos, `docx` para DOCX.

**Spec:** `docs/superpowers/specs/2026-11-09-mtc-presentacion-subsistemas-design.md`

## Global Constraints

- Solo cambia `kind='maintenance'`; las cotizaciones de proyecto no deben cambiar de comportamiento ni de salida.
- `mtc_config = NULL` es válido y significa "una valorización, presentación detallada, sin consumibles". Ninguna fila existente se migra.
- En la base, `systems[0].categories` y `systems[0].items` son siempre `null`; el costeo del Sistema 1 vive en `quotation_categories` / `quotation_line_items`.
- `quotations.frequency` y `visits_per_year` siempre reflejan `systems[0]` (se guardan en sus columnas). `display_currency` refleja `systems[0].currency` solo en el frontend, derivada al cargar: el backend hoy no persiste esa columna.
- Todo cambio al contrato de cotizaciones se aplica en `backend/src/api/quotations.ts` **y** en `backend/src/server-dev.ts` (no comparten código).
- Límites: 1 a 12 sistemas; hasta 100 filas de consumibles por sistema; margen de consumibles 0 a 90; `special_months` entero de 1 a 12.
- Los cálculos base son siempre en CLP; la moneda solo afecta la presentación (`frontend/src/utils/currencyHelper.ts`).
- La base Neon de producción es compartida: la migración es solo aditiva y no se ejecuta `migrate:down` contra producción. Nadie corre `migrate:up` a mano contra bases remotas: el job `migrate-production` de `.github/workflows/ci.yml` la aplica sola al llegar a `main`.
- Tests de frontend: no hay Testing Library instalada y no se agrega. Los tests de componentes montan con `createRoot` + `act` y consultan con `container.querySelector`, como `frontend/src/pages/__tests__/Quotations.test.tsx:216-225`.
- Tests de backend: usan una base falsa en memoria que reconoce las consultas por su texto inicial y lee los parámetros **por posición** (`chatbot.test.ts:374-405`, `quotations-duplicate.test.ts:40-110`). Todo parámetro SQL nuevo se agrega **al final** de la lista (después de `id` y `version`) para no desplazar índices, y no se cambia el texto inicial de consultas existentes.
- Cotización bloqueada (`isLocked` en `Maintenance.tsx:419`, estados Adjudicada / Perdida / Cerrada sin rol admin): todos los controles nuevos que modifican datos quedan deshabilitados; cambiar de sistema para mirar sigue permitido.
- Textos de interfaz y de documento en español. Los textos por defecto se copian literalmente de la spec.
- Al terminar cada tarea que toque código: `graphify update .`

## Review Focus

1. **Mantención antigua (`mtc_config` nulo) abierta, editada y guardada**: debe verse y exportarse como hoy, y al guardarse quedar con un solo sistema equivalente. Test en Task 1 (`ensureMtcConfig`) y Task 4.
2. **Guardar mientras se costea el sistema 2 o 3**: el costeo del Sistema 1 no debe perderse ni cruzarse con otro. Test en Task 1 (`toPersistedQuotation`) y Task 4.
3. **Actualización desde el chatbot o desde un cliente que no envía `mtc_config`**: no debe borrar la configuración existente. Test en Task 2 y Task 3.
4. **Régimen Especial con meses vacío, 0, negativo, decimal o mayor que 12, y margen de consumibles de 100 o más**: sin división por cero, sin `NaN` ni `Infinity` en pantalla o en el documento. Test en Task 1.
5. **Exportar a PDF con texto editado largo**: el texto debe salir completo, sin el recorte de un `textarea`. Verificación en Task 6.

---

### Task 1: Tipos y módulo de dominio `mtcSystems`

**Files:**

- Create: `frontend/src/utils/costeoMath.ts`
- Create: `frontend/src/utils/mtcSystems.ts`
- Modify: `frontend/src/types/index.ts` (tipo `MtcFrequency`, línea 18; interfaces de cotización en ~116-125 y ~400-411)
- Modify: `frontend/src/stores/maestro-store.ts:213-253` (`VISITS_PER_YEAR`, `FREQUENCY_LABELS`, `calcCat`, `calcTotals`)
- Test: `frontend/src/utils/__tests__/mtcSystems.test.ts`

**Interfaces:**

- Produces (en `types/index.ts`): `MtcFrequency` con los 8 valores de la spec; `MtcSchedule`; `MtcConsumableRow`; `MtcConsumables`; `MtcSystem`; `MtcConfig` (formas exactas en la spec). `MasterQuotation` gana `mtc_config: MtcConfig | null` y `mtc_active_system: number`.
- Produces (en `costeoMath.ts`): `calcCat` y `calcTotals` movidas tal cual desde el store, más `costeoVenta(categories: CostCategory[], items: Record<CategoryId, CostItem[]>): number`. El store las re-exporta (`export { calcCat, calcTotals } from '../utils/costeoMath'`) para no tocar los imports existentes.
- Produces (en `mtcSystems.ts`, sin importar el store):
  - `MTC_FREQUENCIES: MtcFrequency[]`, `MTC_FREQUENCY_LABELS: Record<MtcFrequency, string>`, `MTC_SCHEDULE_LABELS: Record<MtcSchedule, string>`
  - `clampSpecialMonths(v: unknown): number` → entero 1..12, por defecto 1
  - `visitsFor(frequency: MtcFrequency, specialMonths: number | null): number`
  - `intervalText(frequency: MtcFrequency, specialMonths: number | null): string`
  - `defaultSummaryText(sys: Pick<MtcSystem, 'frequency' | 'special_months' | 'schedule'>): string`
  - `summaryTextOf(sys: MtcSystem): { text: string; edited: boolean }`
  - `consumableLines(c: MtcConsumables): { row: MtcConsumableRow; qty: number; unitPrice: number; total: number }[]`
  - `newMtcSystem(n: number, costeo: { categories: CostCategory[]; items: Record<CategoryId, CostItem[]> } | null): MtcSystem`
  - `ensureMtcConfig(q: MasterQuotation): MtcConfig`
  - `systemCosteo(q: MasterQuotation, index: number): { categories: CostCategory[]; items: Record<CategoryId, CostItem[]> }`
  - `systemTotals(q: MasterQuotation, index: number): { visits: number; isUnique: boolean; visitNet: number; yearNet: number; consumablesNet: number }`
  - `grandSummary(q: MasterQuotation): { rows: { label: string; net: number }[]; net: number; iva: number; total: number }`
  - `selectMtcSystem(q: MasterQuotation, index: number): MasterQuotation`
  - `toPersistedQuotation(q: MasterQuotation): MasterQuotation`
  - `syncPrimaryMirror(q: MasterQuotation): MasterQuotation`

- [ ] **Step 1: Write the failing tests** en `mtcSystems.test.ts`. Usar una fábrica local `makeQ(overrides)` que arme un `MasterQuotation` mínimo con dos categorías (`mo` margen 35 con un ítem cant 1 × unit 210000; `log` margen 30 con un ítem cant 1 × unit 49500). Casos y valores:

```ts
// visitas
expect(visitsFor('mensual', null)).toBe(12)
expect(visitsFor('bimestral', null)).toBe(6)
expect(visitsFor('trimestral', null)).toBe(4)
expect(visitsFor('cuatrimestral', null)).toBe(3)
expect(visitsFor('semestral', null)).toBe(2)
expect(visitsFor('anual', null)).toBe(1)
expect(visitsFor('unico', null)).toBe(1)
expect(visitsFor('especial', 5)).toBe(2) // round(12/5)
expect(visitsFor('especial', 12)).toBe(1)
// entradas inválidas de meses (Review Focus 4)
for (const bad of [null, 0, -3, 2.7, 99, NaN, '' as unknown as number])
  expect(Number.isFinite(visitsFor('especial', bad as number))).toBe(true)
expect(clampSpecialMonths(0)).toBe(1)
expect(clampSpecialMonths(99)).toBe(12)
expect(clampSpecialMonths(2.7)).toBe(3)

// texto por defecto (copiado de la spec)
expect(
  defaultSummaryText({ frequency: 'bimestral', special_months: null, schedule: 'habil' })
).toBe(
  'C/u. Servicio de Mantención Preventiva (visita Bimestral en horario hábil).\n' +
    'Cada Servicio, se realiza considerando frecuencia bimestral de visita (cada dos (2) meses), para completar el periodo de Un (1) año. ' +
    'Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.'
)
expect(defaultSummaryText({ frequency: 'unico', special_months: null, schedule: 'continuo' })).toBe(
  'Servicio de Mantención Preventiva (visita única en régimen 24x7).\n' +
    'Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.'
)
expect(intervalText('especial', 5)).toBe('cada 5 meses')
expect(intervalText('especial', 1)).toBe('cada mes')

// texto editado se conserva; null o igual al generado no cuenta como editado
expect(summaryTextOf({ ...sys, summary_text: null }).edited).toBe(false)
expect(summaryTextOf({ ...sys, summary_text: 'Mi texto' })).toEqual({
  text: 'Mi texto',
  edited: true,
})

// consumibles (valores de la imagen de referencia, margen 30)
const lines = consumableLines({
  enabled: true,
  margin: 30,
  rows: [
    {
      id: 'a',
      desc: 'Filtro de Aire',
      unidad: 'c/u',
      per_module: 1,
      modules: 1,
      changes_per_year: 6,
      cost: 11822,
    },
    {
      id: 'b',
      desc: 'Cilindro Humidificador',
      unidad: 'c/u',
      per_module: 1,
      modules: 1,
      changes_per_year: 2,
      cost: 102525,
    },
  ],
})
expect(lines.map(l => [l.qty, l.unitPrice, l.total])).toEqual([
  [6, 16889, 101334],
  [2, 146464, 292928],
])
// margen fuera de rango no produce Infinity (Review Focus 4)
expect(consumableLines({ enabled: true, margin: 100, rows: [rowA] })[0].unitPrice).toBe(118220) // acotado a 90
expect(consumableLines({ enabled: true, margin: -5, rows: [rowA] })[0].unitPrice).toBe(11822)
```

Más estos casos de comportamiento:

- `ensureMtcConfig` con `mtc_config: null`, `frequency: 'trimestral'`, `display_currency: 'UF'` → `{ v: 1, summary_mode: false, show_summary_table: false, systems: [un sistema] }` con `frequency 'trimestral'`, `currency 'UF'`, `schedule 'habil'`, `summary_text null`, `consumables.enabled false`, `categories null`, `items null`. Con `frequency: null` → `'mensual'`. Con `mtc_config` ya presente → lo devuelve sin cambios (misma referencia).
- `systemTotals(q, 0)` con el `makeQ` de arriba y régimen bimestral → `visitNet` ≈ 393791.21 (`210000/0.65 + 49500/0.7`, usar `toBeCloseTo(…, 2)`), `yearNet` = `visitNet × 6`, `consumablesNet 0` con consumibles desactivados y `394262` con las dos filas de arriba activadas.
- `selectMtcSystem`: con dos sistemas y activo 0, seleccionar 1 → `q.categories`/`q.items` pasan a ser los del sistema 1, `systems[1].categories === null`, `systems[0].categories` contiene el costeo que estaba en pantalla, `mtc_active_system === 1`. Seleccionar el mismo índice activo devuelve el mismo objeto. Índice fuera de rango devuelve el mismo objeto.
- Ida y vuelta (Review Focus 2): `toPersistedQuotation(selectMtcSystem(q, 1))` tiene `mtc_active_system 0`, `categories`/`items` iguales (`toEqual`) a los de `q` original, `systems[0].categories === null` y `systems[1].categories` igual al original.
- `syncPrimaryMirror`: tras cambiar `systems[0]` a `especial` con `special_months 5` y `currency 'USD'` → `q.frequency 'especial'`, `q.visits_per_year 2`, `q.display_currency 'USD'`.
- `grandSummary` con dos sistemas (el segundo con consumibles activos) → 3 filas en orden: servicio sistema 1, servicio sistema 2, consumibles sistema 2; `net` = suma; `iva` = `net × q.iva/100`; `total` = `net + iva`. Las etiquetas incluyen el nombre del sistema.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/mtcSystems.test.ts`
Expected: FAIL (módulo `../mtcSystems` no existe).

- [ ] **Step 3: Ampliar tipos** en `types/index.ts` según el bloque Interfaces. En las dos interfaces de cotización, `mtc_config` y `mtc_active_system` son obligatorios en `MasterQuotation`; en el tipo de respuesta de API (`~116-125`) solo `mtc_config?: MtcConfig | null`.

- [ ] **Step 4: Crear `costeoMath.ts`** moviendo `calcCat` y `calcTotals` desde el store sin cambiar su cuerpo, agregar `costeoVenta`, y dejar el re-export en el store. En el store, completar `VISITS_PER_YEAR` (`bimestral: 6`, `cuatrimestral: 3`, `unico: 1`, `especial: 1`) y `FREQUENCY_LABELS` (`Bimestral`, `Cuatrimestral`, `Especial`, `Único`).

- [ ] **Step 5: Implementar `mtcSystems.ts`** con las firmas del bloque Interfaces. Decisiones que las firmas no fijan:
  - `visitsFor('especial', m)` = `max(1, round(12 / clampSpecialMonths(m)))`.
  - `consumableLines`: margen acotado a `[0, 90]`; `unitPrice = Math.round(cost / (1 - margin/100))`; cantidades y costos no finitos o negativos cuentan como 0.
  - `newMtcSystem(n, costeo)`: `id` con `crypto.randomUUID()`, `name` = `'Sistema 1'` si `n === 1`, si no `'Subsistema ' + n`; `frequency 'mensual'`, `schedule 'habil'`, `currency 'CLP'`, `consumables { enabled: false, margin: 30, rows: [] }`.
  - `systemCosteo(q, i)`: si `i === q.mtc_active_system` devuelve `q.categories`/`q.items`; si no, el casillero del sistema.
  - `selectMtcSystem` no muta: devuelve una cotización nueva.
  - Etiquetas de `grandSummary`: `'Servicio de mantención · {name} ({visits} visitas)'` (singular `visita` cuando es 1) y `'Repuestos consumibles · {name}'`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/utils/__tests__/mtcSystems.test.ts && npx vitest run && npx tsc -b`
Expected: PASS; el `tsc` puede fallar solo por los sitios que construyen `MasterQuotation` sin los campos nuevos: corregirlos con `mtc_config: null, mtc_active_system: 0` (son `newDraft` y el mapeo de `api.ts`; su comportamiento real llega en Task 4).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/utils/costeoMath.ts frontend/src/utils/mtcSystems.ts frontend/src/utils/__tests__/mtcSystems.test.ts frontend/src/stores/maestro-store.ts frontend/src/api/api.ts
git commit -m "feat(mantenciones): dominio de sistemas, regimenes y consumibles"
```

---

### Task 2: Backend PostgreSQL — columna `mtc_config` y regímenes nuevos

**Files:**

- Create: `backend/src/db/migrations/1700000028000_0028-mtc-config.js`
- Modify: `backend/src/schemas/quotations.ts` (`FREQUENCIES`, `quotationBodyBase` ~63-75)
- Modify: `backend/src/api/quotations.ts` (`VALID_FREQUENCIES` línea 80; UPDATE ~700-750; INSERT ~885-920; duplicado ~1395-1435)
- Test: `backend/src/api/__tests__/quotations-mtc-config.test.ts`

**Interfaces:**

- Produces: el cuerpo de `POST /api/quotations` y `PUT /api/quotations/:id` acepta `mtc_config` (objeto, `null` o ausente); `GET` lo devuelve en `q.mtc_config` (ya viaja por `SELECT q.*`). `frequency` acepta los 8 valores.
- Produces (en `schemas/quotations.ts`): `mtcConfigSchema` exportado.

- [ ] **Step 1: Write the failing tests**, siguiendo el armado de `quotations-duplicate.test.ts` (app Express con `createQuotationsRouter` y base falsa en memoria que guarda los parámetros de cada consulta). La base falsa no ejecuta SQL, así que los tests afirman sobre los **parámetros capturados**. Casos:
  - `POST` con `kind: 'maintenance'`, `frequency: 'bimestral'` y un `mtc_config` válido de dos sistemas → 201 y el último parámetro del `INSERT INTO quotations` es `JSON.stringify(mtc_config)`.
  - `PUT` **sin** la clave `mtc_config` → los dos últimos parámetros del `UPDATE quotations` son `false` y `null` (Review Focus 3); los parámetros de `id` y `version` siguen en los índices 21 y 22.
  - `PUT` con un `mtc_config` válido → `true` y su JSON. `PUT` con `mtc_config: null` → `true` y `null`.
  - Duplicar (`POST /:id/duplicate`) de una fila origen con `mtc_config` → el último parámetro del `INSERT` de la copia es ese mismo JSON.
  - Prueba unitaria de `mtcConfigSchema.safeParse` para cada rechazo de la lista siguiente (además del 400 por HTTP en uno de ellos).
  - Rechazos 400: `systems: []`; 13 sistemas; `systems[0].categories` no nulo; `frequency: 'quincenal'` dentro de un sistema; `special_months: 0` y `13`; `consumables.margin: 95`; 101 filas de consumibles; `schedule: 'nocturno'`.
  - `frequency: 'unico'` y `'especial'` a nivel de cotización → 201.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/api/__tests__/quotations-mtc-config.test.ts`
Expected: FAIL (400 por `frequency` desconocida y `mtc_config` ausente en la respuesta).

- [ ] **Step 3: Escribir la migración.** `ALTER TYPE … ADD VALUE` no puede ir dentro de una transacción que luego use el valor, así que la migración declara `pgm.noTransaction()`:

```js
exports.up = pgm => {
  pgm.noTransaction()
  for (const v of ['bimestral', 'cuatrimestral', 'especial', 'unico'])
    pgm.sql(`ALTER TYPE mtc_frequency ADD VALUE IF NOT EXISTS '${v}'`)
  pgm.sql(`ALTER TABLE quotations ADD COLUMN IF NOT EXISTS mtc_config JSONB`)
}
// PostgreSQL no permite quitar valores de un enum: el down solo quita la columna.
exports.down = pgm => {
  pgm.sql(`ALTER TABLE quotations DROP COLUMN IF EXISTS mtc_config`)
}
```

**No modificar `backend/src/db/schema.sql`**: es la línea base congelada que ejecuta la migración `0001` (`docs/MIGRACIONES.md`); las migraciones posteriores, como la `0024`, tampoco lo tocan. El patrón `pgm.noTransaction()` + `ADD VALUE IF NOT EXISTS` ya se usa en las migraciones `0009`, `0011`, `0014` y `0020`.

- [ ] **Step 4: Validación Zod.** Agregar los 4 regímenes a `FREQUENCIES` y a `VALID_FREQUENCIES`. Definir `mtcConfigSchema` con los límites de Global Constraints: `v: z.literal(1)`; `systems` de 1 a 12; por sistema `id` y `name` (1 a 120 caracteres), `frequency`, `special_months` entero 1..12 o `null`, `schedule`, `currency` en `CLP|UF|USD`, `summary_text` hasta 4000 caracteres o `null`, `consumables { enabled, margin 0..90, rows máx. 100 }` con cada fila `{ id, desc ≤300, unidad ≤20, per_module, modules, changes_per_year, cost }` numéricos finitos ≥ 0; `categories` máx. 10 e `items` como registro de arreglos (máx. 500 ítems en total por sistema), ambos `null` permitidos. Estos dos usan **esquemas propios con la forma del frontend** (`CostCategory`: `id`, `label`, `margin`, `color`, `showDetails`, `showValues`, `note`, `collapsed`; `CostItem`: `id`, `desc`, `unidad`, `cant`, `unit`, y opcionales `days`, `puntoA`, `puntoB`), no `categoryInputSchema` / `lineItemInputSchema`: `desc` vacío es válido porque el costeo por defecto trae filas en blanco. Agregar un test que acepte un sistema con el costeo por defecto del frontend. Un `superRefine` exige `systems[0].categories === null && systems[0].items === null`. En `quotationBodyBase`: `mtc_config: mtcConfigSchema.nullish()`.

- [ ] **Step 5: Persistencia en `quotations.ts`.** Los parámetros nuevos van siempre al final de cada lista. INSERT: columna `mtc_config` al final, valor `body.mtc_config ? JSON.stringify(body.mtc_config) : null`. UPDATE (`quotations.ts:701-754`): `mtc_config = CASE WHEN $24::boolean THEN $25::jsonb ELSE mtc_config END`, con `$24 = 'mtc_config' in body` y `$25` el JSON o `null`; `WHERE id = $22 AND version = $23` no cambia. Duplicado: columna al final, valor `source.mtc_config ? JSON.stringify(source.mtc_config) : null`. `display_currency` **no se toca en el backend**: hoy ninguna ruta la escribe (solo existe en el esquema Zod y en la migración `0024`), y arreglar eso es un cambio aparte. La moneda de cada sistema se persiste dentro de `mtc_config`.

- [ ] **Step 5b: Actualizar las bases falsas existentes** solo donde haga falta para que sigan pasando: `quotations.test.ts:29-57`, `chatbot.test.ts:374-405` y `quotations-duplicate.test.ts` deben seguir leyendo `id`/`version` en sus índices actuales; si alguna desestructura o afirma el largo exacto de `params`, ajustarla.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run && npx tsc -p tsconfig.build.json --noEmit`
Expected: PASS, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/migrations/1700000028000_0028-mtc-config.js backend/src/db/schema.sql backend/src/schemas/quotations.ts backend/src/api/quotations.ts backend/src/api/__tests__/quotations-mtc-config.test.ts
git commit -m "feat(mantenciones): columna mtc_config y regimenes nuevos en el backend"
```

---

### Task 3: Backend de desarrollo y chatbot conservan `mtc_config`

**Files:**

- Modify: `backend/src/server-dev.ts` (creación ~770-820; actualización ~940-975; duplicado, buscar `show_uf_equivalent`)
- Modify: `backend/src/api/chatbot.ts:~695-710` y `backend/src/services/chatbotOps.ts:~620-635` (cuerpos que reconstruyen la cotización desde `existing`)
- Test: `backend/src/api/__tests__/chatbot.test.ts` (agregar un caso)

**Interfaces:**

- Consumes: contrato de `mtc_config` de Task 2.

- [ ] **Step 1: Write the failing test** en `chatbot.test.ts`, con el armado de los casos existentes de `modificar_cotizacion`: sembrar en la base falsa una mantención con `mtc_config` de dos sistemas; extender el manejador `UPDATE quotations` de la base falsa (`chatbot.test.ts:374-405`) para aplicar `mtc_config` solo cuando `params[23] === true` (valor en `params[24]`); tras la operación del chatbot, la fila conserva `mtc_config` (`toEqual`) (Review Focus 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/api/__tests__/chatbot.test.ts`
Expected: FAIL hasta que el cuerpo que arma el chatbot lleve `mtc_config: existing.mtc_config` en `chatbot.ts` y `chatbotOps.ts` (se envía explícito, sin depender de la regla "clave ausente = conservar").

- [ ] **Step 3: `server-dev.ts`.** Crear: guardar `mtc_config ?? null`. Actualizar: `mtc_config: 'mtc_config' in req.body ? req.body.mtc_config : (q.mtc_config ?? null)`. Duplicar: copiar. Aceptar los 8 regímenes donde se normalice `frequency`. Validar el cuerpo con `mtcConfigSchema` si el handler ya usa los esquemas de `schemas/quotations.ts`; si no los usa, no agregar validación nueva aquí.

- [ ] **Step 4: Verificación manual del backend de desarrollo**

Run: `cd backend && npx tsc -p tsconfig.build.json --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server-dev.ts backend/src/api/chatbot.ts backend/src/services/chatbotOps.ts backend/src/api/__tests__/chatbot.test.ts
git commit -m "feat(mantenciones): server-dev y chatbot conservan mtc_config"
```

---

### Task 4: Mapeo de API y acciones del store

**Files:**

- Modify: `frontend/src/api/api.ts` (tipo de entrada ~239; mapeo servidor→maestro ~535-560; mapeo maestro→servidor ~640-660)
- Modify: `frontend/src/stores/maestro-store.ts` (interfaz de acciones ~372; `newDraft` ~613-690; `saveActive` ~833; acciones nuevas junto a `patchActive` ~820)
- Test: `frontend/src/stores/__tests__/maestro-store.test.ts`

**Interfaces:**

- Consumes: todo el bloque Produces de Task 1.
- Produces (acciones del store, todas sobre la cotización activa y marcando `unsaved`):
  - `patchMtc(fields: Partial<Pick<MtcConfig, 'summary_mode' | 'show_summary_table'>>): void`
  - `addMtcSystem(): void`
  - `removeMtcSystem(index: number): void`
  - `selectMtcSystem(index: number): void`
  - `patchMtcSystem(index: number, fields: Partial<Omit<MtcSystem, 'id' | 'categories' | 'items' | 'consumables'>>): void`
  - `patchMtcConsumables(index: number, fields: Partial<Pick<MtcConsumables, 'enabled' | 'margin'>>): void`
  - `addMtcConsumableRow(index: number, seed?: Partial<MtcConsumableRow>): void`
  - `patchMtcConsumableRow(index: number, rowId: string, fields: Partial<MtcConsumableRow>): void`
  - `removeMtcConsumableRow(index: number, rowId: string): void`
- Produces: `defaultCosteo(): { categories: CostCategory[]; items: Record<CategoryId, CostItem[]> }` exportado desde el store (copias profundas de `DEFAULT_CATEGORIES` / `DEFAULT_ITEMS`).

- [ ] **Step 1: Write the failing tests** en `maestro-store.test.ts`, con el patrón de los tests existentes del store:
  - `newDraft('maintenance')` → `mtc_config.systems.length === 1`, `mtc_active_system === 0`, `summary_mode === false`; `newDraft('project')` → `mtc_config === null`.
  - `addMtcSystem()` → 2 sistemas; el nuevo tiene costeo por defecto no nulo y nombre `'Subsistema 2'`. Con 12 sistemas, una llamada más no agrega.
  - `selectMtcSystem(1)` y luego `addItem('mo')` → el ítem se agrega al costeo del sistema 2 y el del sistema 1 no cambia (comparar tras `selectMtcSystem(0)`).
  - `removeMtcSystem(1)` estando activo el 1 → vuelve a activo 0 con el costeo del sistema 1 en pantalla. `removeMtcSystem(0)` con más de un sistema → el sistema 2 pasa a ser el 1 y su costeo queda en `q.categories`. Con un solo sistema no hace nada.
  - `patchMtcSystem(0, { frequency: 'bimestral' })` → `q.frequency === 'bimestral'` y `q.visits_per_year === 6`; `patchMtcSystem(1, { frequency: 'anual' })` no cambia `q.frequency`.
  - `patchMtcSystem(0, { summary_text: 'x' })` y luego cambiar el régimen → `summary_text` sigue siendo `'x'`.
  - Mantención cargada con `mtc_config: null` (Review Focus 1): la primera acción `patchMtc({ summary_mode: true })` materializa la configuración con `ensureMtcConfig` y un sistema.
  - `saveActive()` con el sistema 2 activo (Review Focus 2): el cuerpo enviado a la API (espiar el cliente como hacen los tests existentes de guardado) lleva `categories`/`line_items` del sistema 1 y `mtc_config.systems[0].categories === null`; después de guardar, la pantalla sigue en el sistema 2.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/stores/__tests__/maestro-store.test.ts`
Expected: FAIL (acciones no definidas).

- `saveActive()` con el sistema 2 activo: el `total` que se guarda es el neto por visita del **Sistema 1**, no el del sistema en pantalla.
- `loadData()` con una mantención local que tiene el sistema 2 activo y `version` igual a la del servidor (Review Focus 2): tras la fusión, `mtc_active_system === 0`, `items` y `categories` son los del Sistema 1 y `mtc_config.systems[1]` conserva su costeo local. Con `version` del servidor mayor, gana el servidor completo (comportamiento actual).

- [ ] **Step 3: Mapeo en `api.ts`.** Servidor→maestro (`toMasterQuotation`, ~535-560): `mtc_config: q.mtc_config ?? null`, `mtc_active_system: 0`; si `q.mtc_config?.systems?.[0]` existe, pasar el resultado por `syncPrimaryMirror` para que `frequency`, `visits_per_year` y `display_currency` salgan de `systems[0]`. Maestro→servidor: serializar desde `toPersistedQuotation(q)` e incluir `mtc_config`; no enviar `mtc_active_system`. Para `kind: 'project'` enviar `mtc_config: null`.

- [ ] **Step 4: Acciones del store.** Cada acción parte de `ensureMtcConfig(q)`, aplica el cambio de forma inmutable y, si toca `systems[0]`, pasa el resultado por `syncPrimaryMirror`. `selectMtcSystem` delega en la función pura. `removeMtcSystem` primero selecciona el sistema 0 (o el 1 si se elimina el 0) y luego quita el casillero. `newDraft('maintenance')` crea `mtc_config` con `newMtcSystem(1, null)`.
  - `saveActive` (`maestro-store.ts:833-878`): calcular `total` con `calcTotals(toPersistedQuotation(q))`; enviar la forma persistida; al recibir `saved`, reaplicar `selectMtcSystem(saved, índiceQueEstabaActivo)` antes de ponerlo en el store, para que la pantalla no salte al Sistema 1.
  - `loadData` (`maestro-store.ts:497-525`): la fusión hoy conserva `items` locales sobre la fila liviana del servidor. Antes de fusionar, normalizar la local con `toPersistedQuotation(localQ)`; cuando se conservan los `items` locales, conservar también `categories` y `mtc_config` de esa local normalizada. Así nunca queda el costeo de un subsistema bajo la cabecera del Sistema 1.
  - `loadQuote` (`maestro-store.ts:690-705`): la cotización hidratada desde el servidor reemplaza a la local y entra con `mtc_active_system: 0`; no conservar el índice activo anterior. Test: tras `loadQuote`, `mtc_active_system === 0` y `q.items` son los del Sistema 1.
  - El store persiste `quotations` en `localStorage` (`partialize`, `maestro-store.ts:1174`), incluido `mtc_active_system`: es coherente porque el casillero activo y `q.categories`/`q.items` se guardan juntos. No excluirlo.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/api.ts frontend/src/stores/maestro-store.ts frontend/src/stores/__tests__/maestro-store.test.ts
git commit -m "feat(mantenciones): store y mapeo de API para sistemas y consumibles"
```

---

### Task 5: Panel de control (pestaña Base) y selector de sistema en Costeo

**Files:**

- Create: `frontend/src/pages/maintenance/MtcSystemsPanel.tsx`
- Create: `frontend/src/pages/maintenance/MtcConsumablesEditor.tsx`
- Create: `frontend/src/pages/maintenance/MtcSystemTabs.tsx`
- Modify: `frontend/src/pages/Maintenance.tsx` (`pendingPeriods` 40-56; `MaintenanceList` ~237-250; `TabBaseMtc` 414-670, en particular el `<select>` de frecuencia ~562-566 y el cálculo de visitas ~433; render de la pestaña Costeo)
- Modify: hoja de estilos donde viven las clases `mtc-*` (ubicarla buscando `mtc-currency-toggle`)
- Test: `frontend/src/pages/__tests__/Maintenance.systems.test.tsx`

**Interfaces:**

- Consumes: acciones del store de Task 4; `MTC_FREQUENCIES`, `MTC_FREQUENCY_LABELS`, `MTC_SCHEDULE_LABELS`, `visitsFor`, `intervalText`, `ensureMtcConfig`, `consumableLines` de Task 1.
- Produces: `<MtcSystemsPanel disabled={boolean} />` (lee la cotización activa), `<MtcConsumablesEditor systemIndex={number} disabled={boolean} />`, `<MtcSystemTabs />` (sin props). `TabBaseMtc` les pasa `disabled={isLocked}`.

- [ ] **Step 1: Write the failing tests** con `createRoot` + `act` y consultas al DOM (ver Global Constraints), usando el armado de `Quotations.test.tsx` para montar el store. Los campos se ubican por el texto de su `<label>` asociado (`for`/`id`) o por `aria-label`:
  - Con una mantención en estado `Adjudicada` y rol no admin, todos los campos, checks y botones del panel y del editor de consumibles tienen `disabled`; los botones de `MtcSystemTabs` no.
  - `MtcSystemsPanel` muestra una tarjeta "Valorización 1" con campos accesibles por etiqueta: "Sistema o subsistema", "Régimen", "Horario", "Moneda de los precios" y el check "Incluye repuestos consumibles".
  - El selector "Régimen" ofrece exactamente 8 opciones, en el orden de la spec.
  - Elegir "Especial (meses)" hace aparecer "Cada cuántos meses"; escribir `5` muestra "2 visitas al año (cada 5 meses)."; elegir "Único" muestra "Una sola visita, sin valor anual."
  - "Agregar valorización" agrega la tarjeta "Valorización 2" con botón "Quitar"; con una sola tarjeta no hay "Quitar".
  - Marcar "Incluye repuestos consumibles" muestra "Margen de consumibles (%)" y "Agregar repuesto"; agregar una fila con costo 11822, por módulo 1, módulos 1, cambios por año 6 y margen 30 muestra cantidad `6` y precio unitario `$16.889`.
  - `MtcSystemTabs` con dos sistemas muestra un botón por sistema con su nombre; al pulsar el segundo, `mtc_active_system` del store pasa a 1.
  - `pendingPeriods` (exportarla para el test) devuelve `null` con `frequency: 'unico'` (supuesto S4).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Maintenance.systems.test.tsx`
Expected: FAIL (componentes no existen).

- [ ] **Step 3: Implementar `MtcSystemsPanel`** y reemplazar en `TabBaseMtc` el bloque de frecuencia y visitas por el panel. Los campos de equipos, cliente y vigencia de `TabBaseMtc` no cambian. Cada control llama a la acción del store correspondiente; "Cada cuántos meses" guarda el valor pasado por `clampSpecialMonths`.

- [ ] **Step 4: Implementar `MtcConsumablesEditor`**: tabla editable con columnas Descripción, Un., Por módulo, Módulos, Cambios/año, Cant. total (calculada), Costo unit., Precio unit. (calculado), Total (calculado), y botón "Agregar repuesto". La descripción usa `CatalogAutocomplete` (`frontend/src/components/CatalogAutocomplete.tsx`, props `catId`, `value`, `onChange`, `onSelect`) con `catId="rep"`; en `onSelect(item: CatalogItemUI)` se copian `item.desc → desc`, `item.unidad → unidad` e `item.price → cost`. Se permite texto libre con `onChange`.

- [ ] **Step 5: Implementar `MtcSystemTabs`** y montarlo sobre `<TabCosteo />` en la pestaña Costeo de `Maintenance.tsx`, visible solo si hay más de un sistema.

- [ ] **Step 6: Reemplazar los cálculos de visitas** en `Maintenance.tsx` (`pendingPeriods`, `MaintenanceList`, `TabBaseMtc`) por `q.visits_per_year ?? visitsFor(q.frequency, ensureMtcConfig(q).systems[0].special_months)`; `pendingPeriods` devuelve `null` cuando `frequency === 'unico'`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src/pages/Maintenance.tsx src/pages/maintenance`
Expected: PASS, sin errores de lint.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Maintenance.tsx frontend/src/pages/maintenance frontend/src/pages/__tests__/Maintenance.systems.test.tsx frontend/src
git commit -m "feat(mantenciones): panel de valorizaciones, consumibles y selector de sistema"
```

---

### Task 6: Documento en pantalla (sección IV) y PDF

**Files:**

- Create: `frontend/src/pages/maintenance/MtcValuationSection.tsx`
- Create: `frontend/src/utils/mtcDocument.ts`
- Modify: `frontend/src/pages/Maintenance.tsx:672-1107` (`TabDocumentoMtc`: barra de herramientas ~798-844; sección III ~918-939; sección IV ~941-1078)
- Modify: `frontend/src/utils/quotationRows.ts` (aceptar un costeo explícito)
- Test: `frontend/src/utils/__tests__/mtcDocument.test.ts`, `frontend/src/pages/__tests__/Maintenance.document.test.tsx`

**Interfaces:**

- Consumes: Task 1 y Task 4; `getCurrencyInfo`, `convertAmount`, `formatCurrency` de `currencyHelper.ts`.
- Produces (en `quotationRows.ts`): `buildValuationRows(categories: CostCategory[], items: Record<CategoryId, CostItem[]>, expandedCategoryIds?: Iterable<string>): QuotationValuationRow[]`; `buildQuotationValuationRows(q, expanded)` queda como envoltorio que la llama con `q.categories`/`q.items`.
- Produces (en `mtcDocument.ts`, modelo de documento que comparten pantalla, HTML y DOCX):

```ts
interface MtcMoneyRow {
  label: string
  amount: string
} // ya formateado en la moneda del bloque
interface MtcSystemBlock {
  index: number
  title: string // 'IV.1 Clima de precisión · Bimestral'
  currencyNote: string // 'Valores expresados en UF (ref. $39.500 por UF).'
  currencyCode: 'CLP' | 'UF' | 'USD'
  visits: number
  isUnique: boolean
  detailRows: {
    catId: string
    n: number
    label: string
    amount: string
    details: QuotationDetailRow[]
  }[]
  visitTotals: MtcMoneyRow[] // subtotal neto por visita, IVA, total con IVA
  annualTotals: MtcMoneyRow[] // vacío si isUnique
  summaryRow: {
    item: number
    qty: number
    text: string
    edited: boolean
    unit: string
    total: string
  }
  summaryTotals: MtcMoneyRow[] // precio neto total, IVA, precio total con IVA
  consumables: null | {
    schedule: {
      n: number
      desc: string
      unidad: string
      perModule: number
      modules: number
      changes: number
      qty: number
    }[]
    priced: { n: number; qty: number; desc: string; unit: string; total: string }[]
    totals: MtcMoneyRow[]
  }
}
interface MtcDocumentModel {
  summaryMode: boolean
  blocks: MtcSystemBlock[]
  grand: null | { rows: MtcMoneyRow[]; totals: MtcMoneyRow[] } // null si show_summary_table es false; siempre CLP
}
function buildMtcDocument(
  q: MasterQuotation,
  expandedCategoryIds?: Iterable<string>
): MtcDocumentModel
function formatMtcMoney(clp: number, q: MasterQuotation, currency: 'CLP' | 'UF' | 'USD'): string
```

- [ ] **Step 1: Write the failing tests de `mtcDocument.test.ts`**:
  - Mantención con `mtc_config: null` (Review Focus 1) → `summaryMode false`, un bloque, `grand null`, `consumables null`; `visitTotals` y `annualTotals` con los mismos montos que produce hoy `TabDocumentoMtc` para esa cotización (calcularlos en el test con `calcTotals` y `fmtCLP`).
  - Bloque en UF con `q.uf = 39500` y neto por visita 443791 → `currencyCode 'UF'`, `visitTotals[0].amount` igual a `formatCurrency(convertAmount(443791, rate), 'UF', 2)` y `currencyNote` que menciona `39.500`.
  - Con `uf = 0` y moneda UF (sin tipo de cambio): el bloque cae a CLP y `currencyNote` dice `'Valores expresados en pesos chilenos (CLP).'`; ningún monto contiene `NaN` ni `Infinity`.
  - Régimen `unico` → `annualTotals` vacío, `summaryRow.qty === 1`.
  - `summaryRow` bimestral: `qty 6`, `unit` = neto por visita formateado, `total` = neto × 6 formateado, `text` = texto por defecto, `edited false`; con `summary_text` propio → ese texto y `edited true`.
  - Sistema con consumibles activos (filas de Task 1) → `schedule` con `qty` 6 y 2; `priced` con `$16.889`/`$101.334` y `$146.464`/`$292.928`; `totals` `$394.262`, `$74.910`, `$469.172` (IVA 19 % redondeado por `fmtCLP`). Con `enabled: false` → `null`.
  - `show_summary_table: true` con dos sistemas en monedas distintas → `grand.totals` en CLP y `grand.rows.length` = sistemas + sistemas con consumibles.

- [ ] **Step 2: Write the failing tests de `Maintenance.document.test.tsx`** (con `createRoot` + `act`, ver Global Constraints):
  - Con la cotización bloqueada, los dos checks, el campo de texto y "Restablecer texto" están deshabilitados.
  - La barra muestra los checks "Presentación resumida" y "Cuadro resumen final"; marcarlos cambia `mtc_config.summary_mode` / `show_summary_table`.
  - Sin "Presentación resumida" se ven las filas de categoría y "TOTAL POR VISITA CON IVA"; con el check se ven las columnas "Ítem", "Cant.", "Descripción", "Precio unit.", "Precio total" y un campo editable con nombre accesible "Texto de la descripción del servicio".
  - Editar ese campo guarda `summary_text` y muestra el botón "Restablecer texto"; pulsarlo deja `summary_text` en `null`.
  - Con dos sistemas se ven dos títulos `IV.1 …` y `IV.2 …`.
  - Con "Cuadro resumen final" se ve "Resumen de valores anuales" y "TOTAL ANUAL CON IVA".

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/mtcDocument.test.ts src/pages/__tests__/Maintenance.document.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implementar `buildValuationRows`, `mtcDocument.ts` y `MtcValuationSection`.** El componente renderiza `buildMtcDocument(q, expandedCats)` con las clases de tabla existentes (`doc-valuation`, `doc-subtotal`, `doc-iva-row`, `doc-total`, `doc-group-title`). El campo de texto es un `<textarea>` con clase `no-print` seguido de un `<div className="print-only">` con el mismo texto y `white-space: pre-line`, para que el PDF muestre el texto completo (Review Focus 5). `pdfExport.ts` captura la pantalla con `html2canvas` y pone la clase `pdf-exporting` en el elemento mientras exporta; `print-only` no existe todavía. Agregar en `frontend/src/styles/Quotations.css` (junto a las reglas `.no-print`, ~1985): `.print-only { display: none }`, `.pdf-exporting .print-only { display: block }`, `.pdf-exporting .mtc-summary-input { display: none }` y lo mismo dentro de `@media print`; el textarea lleva la clase `mtc-summary-input`. Test: el div `print-only` contiene el texto completo editado.

- [ ] **Step 5: Integrar en `TabDocumentoMtc`.** Reemplazar el contenido de la sección IV por `<MtcValuationSection expandedCats={…} onToggleCat={…} />`; agregar los dos checks a la barra junto a "Mostrar UF"; quitar de la barra el selector global de moneda de mantención si existe (la moneda ahora es por valorización). En la sección III mostrar una fila por sistema (nombre, régimen, visitas/año) cuando hay más de uno. Las filas "Equivalente en UF / USD" actuales se conservan solo cuando hay un único sistema.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src`
Expected: PASS.

- [ ] **Step 7: Verificación en el navegador.** Levantar el entorno de desarrollo, abrir una mantención nueva y una existente, y comprobar: ambas presentaciones, dos sistemas con monedas distintas, consumibles, resumen final, y "Descargar PDF" con un texto editado de más de 10 líneas (debe salir completo). Capturar pantalla de la sección IV en ambas presentaciones.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Maintenance.tsx frontend/src/pages/maintenance frontend/src/utils/mtcDocument.ts frontend/src/utils/quotationRows.ts frontend/src/utils/__tests__/mtcDocument.test.ts frontend/src/pages/__tests__/Maintenance.document.test.tsx frontend/src
git commit -m "feat(mantenciones): documento con presentacion resumida, sistemas y consumibles"
```

---

### Task 7: Exportación HTML

**Files:**

- Modify: `frontend/src/utils/htmlExport.ts:160-240` (rama `isMtc`)
- Test: `frontend/src/utils/__tests__/htmlExport.mtc.test.ts`

**Interfaces:**

- Consumes: `buildMtcDocument` de Task 6.
- Produces: `buildHtml(args): string` exportada desde `htmlExport.ts` (extraer de `downloadHtml` la construcción del texto, si hoy no está separada, para poder probarla sin descargar).

- [ ] **Step 1: Write the failing tests**: para una mantención de dos sistemas con consumibles en el primero, `summary_mode: true` y `show_summary_table: true`, el HTML contiene los dos títulos `IV.1` / `IV.2`, el texto por defecto del sistema 1 con el salto de línea convertido a `<br>`, `$16.889`, "Resumen de valores anuales" y **no** contiene "Mano de Obra Especializada". Con `summary_mode: false` sí contiene las categorías. Para una mantención con `mtc_config: null`, el HTML de la sección IV contiene los mismos montos que antes del cambio (Review Focus 1). Un `summary_text` con `<script>` sale escapado.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/htmlExport.mtc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Reescribir la rama `isMtc`** de la sección IV recorriendo `buildMtcDocument(q, expandedCategoryIds)`, con las clases CSS que ya usa el archivo. Todo texto del usuario pasa por la función de escape existente del archivo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/htmlExport.ts frontend/src/utils/__tests__/htmlExport.mtc.test.ts
git commit -m "feat(mantenciones): exportacion HTML con sistemas y consumibles"
```

---

### Task 8: Exportación DOCX

**Files:**

- Modify: `frontend/src/utils/docxExport.ts:370-510` (rama `isMtc`)
- Test: `frontend/src/utils/__tests__/docxExport.mtc.test.ts`

**Interfaces:**

- Consumes: `buildMtcDocument` de Task 6; ayudantes de tabla existentes del archivo (`groupLabel` y los que arman filas de valorización).
- Produces: `buildMtcValuationChildren(model: MtcDocumentModel): (Paragraph | Table)[]` exportada, usada por la rama `isMtc`.

- [ ] **Step 1: Write the failing tests**: `buildMtcValuationChildren` sobre el modelo de dos sistemas del Task 7 devuelve, en presentación resumida, por cada sistema una tabla cuya primera fila tiene 5 celdas y, en presentación detallada, una tabla con una fila por categoría; con consumibles agrega dos tablas (7 y 5 columnas); con `grand` agrega una tabla final. Empaquetar un documento con esos hijos (`Packer.toBuffer`) no lanza error. Para verificar textos, serializar el XML del documento y buscar `IV.1`, `16.889` y "Resumen de valores anuales".

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/docxExport.mtc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `buildMtcValuationChildren`** y usarla en la rama `isMtc` en lugar del bloque actual de "Valor por visita" y "Valor anual estimado". El texto con saltos de línea se parte en `TextRun` con `break`.

- [ ] **Step 4: Run tests to verify they pass, y revisión manual**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: PASS. Además, descargar un DOCX desde la app con dos sistemas y abrirlo en Word para confirmar que las tablas no se desbordan del ancho de página.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/docxExport.ts frontend/src/utils/__tests__/docxExport.mtc.test.ts
git commit -m "feat(mantenciones): exportacion DOCX con sistemas y consumibles"
```

---

### Task 9: Diseño visual "C1 · Marino institucional"

**Files:**

- Create: `frontend/src/styles/MtcDocument.css`
- Modify: `frontend/src/pages/Maintenance.tsx` (`TabDocumentoMtc`: contenedor `coti-doc`, membrete ~846-857, datos del cliente ~859-895, pie ~1090-1103)
- Modify: `frontend/src/pages/maintenance/MtcValuationSection.tsx`
- Modify: `frontend/src/utils/htmlExport.ts` (estilos y estructura de la rama `isMtc`)
- Modify: `frontend/src/utils/docxExport.ts` (rama `isMtc`)
- Modify: `frontend/index.html` (carga de fuentes)
- Test: `frontend/src/pages/__tests__/Maintenance.document.test.tsx`, `frontend/src/utils/__tests__/htmlExport.mtc.test.ts`

**Interfaces:**

- Consumes: `buildMtcDocument` (Task 6), `grandSummary` (Task 1). Referencia visual: sección "C1 · Marino institucional" de `docs/superpowers/mockups/2026-11-09-mtc-estilo-c-sobrio.html`; los valores de la spec ("Diseño visual") mandan sobre la maqueta si difieren.
- Produces: clases con prefijo `mtcd-` en `MtcDocument.css`; el documento de mantención lleva la clase raíz `mtcd-doc` además de `coti-doc`. Las cotizaciones de proyecto no usan estas clases.

- [ ] **Step 1: Write the failing tests**
  - En `Maintenance.document.test.tsx`: el documento tiene un elemento `.mtcd-side` que contiene el correlativo, el nombre del cliente, la referencia y el texto "Total anual con IVA" con el monto de `grandSummary(q).total` formateado en CLP; las secciones I a VI están dentro de `.mtcd-main`; el resumen de la columna aparece **aunque** `show_summary_table` sea `false` (ese check solo controla el cuadro del cuerpo).
  - En `htmlExport.mtc.test.ts`: el HTML de una mantención contiene `mtcd-side`, el color `#0f2440` y `Source Serif 4`; el HTML de una cotización de proyecto no contiene `mtcd-`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/__tests__/Maintenance.document.test.tsx src/utils/__tests__/htmlExport.mtc.test.ts`
Expected: FAIL.

- [ ] **Step 3: Pantalla y PDF.** Reestructurar el documento de mantención como rejilla de dos columnas (`.mtcd-side` 28 % / `.mtcd-main`), con los tokens y tipografías de la spec. La columna lleva: razón social, título, N° de documento, fecha, cliente, atención, referencia y, al pie, el resumen anual con el total. El cuerpo lleva las secciones I a VI con encabezados de tabla marinos, totales como tabla de 300 px alineada a la derecha con la fila final en `#eef1f6`, y el pie con datos de la empresa y "Firma y timbre". El membrete actual (`doc-letterhead`) y la tabla "Datos del Cliente" se reemplazan por la columna; RUT, cargo, correo, usuario final y "Elaborado por" se conservan en una tabla compacta al inicio del cuerpo. Cargar Source Serif 4 (400, 600) y Source Sans 3 (400, 600, 700) en `index.html`; pilas de respaldo `Georgia, serif` y `'Segoe UI', Arial, sans-serif`. `pdfExport.ts` debe esperar `document.fonts.ready` antes de capturar.

- [ ] **Step 4: Ancho angosto.** Bajo 720 px la columna pasa arriba del cuerpo a ancho completo (una columna); las tablas anchas quedan en un contenedor con desplazamiento horizontal. Durante la exportación a PDF (`.pdf-exporting`) se fuerza siempre el diseño de dos columnas.

- [ ] **Step 5: HTML.** Misma estructura y estilos embebidos en la rama `isMtc` de `htmlExport.ts`, con el `<link>` de Google Fonts y las pilas de respaldo. Incluir `@media print` con `print-color-adjust: exact` para que la columna marina se imprima.

- [ ] **Step 6: DOCX.** Word no reproduce una columna de color de alto completo que cruce páginas. Equivalente acordado en la spec: una banda superior de ancho completo (tabla de una fila, celda con sombreado `0F2440`, texto blanco, filete inferior `C9A94F`) con título, N° de documento, fecha, cliente y referencia; encabezados de tabla con sombreado `0F2440`; fila final de totales con sombreado `EEF1F6`; el resumen anual como tabla al final de la sección IV. Fuentes `Georgia` (títulos) y `Calibri` (cuerpo), porque DOCX no incrusta fuentes web.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src`
Expected: PASS.

- [ ] **Step 8: Verificación visual.** En el navegador, comparar el documento contra la maqueta C1 con una mantención de un sistema y otra de tres sistemas (documento de más de una página); exportar PDF y revisar que la columna llega hasta el final y que las fuentes son las correctas; abrir el HTML exportado y el DOCX en Word. Capturas de pantalla, PDF y DOCX se muestran al usuario antes de cerrar la tarea.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/styles/MtcDocument.css frontend/src/pages/Maintenance.tsx frontend/src/pages/maintenance frontend/src/utils/htmlExport.ts frontend/src/utils/docxExport.ts frontend/src/utils/pdfExport.ts frontend/index.html frontend/src/pages/__tests__ frontend/src/utils/__tests__
git commit -m "feat(mantenciones): diseno C1 marino institucional en el documento"
```

---

### Task 10: Verificación final

**Files:**

- Modify: `graphify-out/` (regenerado)

- [ ] **Step 1: Suite completa**

Run: `cd backend && npx vitest run && npx eslint . && npx tsc -p tsconfig.build.json --noEmit`
Run: `cd frontend && npx vitest run && npx eslint . && npm run build`
Expected: todo en verde, incluido el presupuesto de bundle (`check-bundle-budget.mjs`).

- [ ] **Step 2: Migración en una base de prueba** (rama de Neon o Postgres local, nunca producción): aplicar las migraciones, confirmar que `mtc_config` existe y que el enum tiene 8 valores, y que una mantención creada antes de migrar se abre, se edita y se guarda.

- [ ] **Step 3: Recorrido manual** con el backend de desarrollo (`server-dev`): crear una mantención con tres sistemas, uno Único y uno Especial, consumibles en dos, monedas distintas; guardar, recargar la página y comprobar que todo vuelve igual; duplicarla y crear una versión nueva; exportar HTML, DOCX y PDF.

- [ ] **Step 4: Actualizar el grafo y commit**

```bash
graphify update .
git add graphify-out
git commit -m "chore: actualiza grafo tras subsistemas de mantencion"
```
