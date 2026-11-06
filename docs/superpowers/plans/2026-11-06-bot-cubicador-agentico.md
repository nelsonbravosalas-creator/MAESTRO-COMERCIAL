# Bot Cubicador Agéntico: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir E1–E4 y agregar al agente un cubicador con entrevista, calculadoras deterministas, precios por etapas e ingreso aprobado a la cotización, con perfiles HVAC y cierre metálico.

**Architecture:** Módulo nuevo `backend/src/cubicador/` con funciones puras (compuerta y calculadoras) y un borrador persistido. Dos entradas llegan a `ejecutarCubicacion`: la herramienta del agente («procede») y un endpoint sin LLM (botón). Una sola herramienta `cubicar_borrador` reemplaza las varias del diseño porque `MAX_STEPS = 5` no alcanza para encadenarlas.

**Tech Stack:** TypeScript, Express, `pg`, node-pg-migrate, Zod, Vitest, React, Zustand. Modelo por `env.AGENT_MODEL`.

**Spec:** `docs/superpowers/specs/2026-11-06-bot-cubicador-agentico-design.md`

## Global Constraints

- Migraciones solo aditivas. La base Neon se comparte con el bot de Subcontrataley: no correr `migrate:down` ni resets en producción.
- Toda tabla nueva lleva `tenant_id UUID` nullable (rumbo multi-tenant).
- PII A-21: pasar `scrubPii` a texto libre antes de guardarlo o devolverlo al modelo; nunca entregar RUT, email o teléfono al LLM.
- El LLM nunca calcula montos ni cantidades.
- La función de Vercel vive 60 s; el agente tiene `WALL_CLOCK_BUDGET_MS = 40_000`.
- `gh` siempre con `-R nelsonbravosalas-creator/MAESTRO-COMERCIAL`.
- Después de modificar código: `graphify update .`
- Comandos: `cd backend && npx vitest run <ruta>`; `cd frontend && npx vitest run <ruta>`; lint con `npm run lint`; build con `npm run build`.

## Review Focus

1. **LLM local activo (`LLM_ROUTING_STRATEGY` híbrido):** `callLlm` no reenvía `tools`, así que la búsqueda de precios alucinaría. Debe saltar a Gemini. Test en Tarea 13.
2. **Datos absurdos de Gemini (largo negativo, diámetro desconocido, placa 0):** la cubicación no devuelve NaN ni inventa; rechaza con mensaje claro. Tests en Tareas 6 y 7.
3. **«Procede» con compuerta cerrada:** responde qué falta, sin cubicar. Test en Tarea 11.
4. **Confirmar tras cambiar la cotización o el borrador:** conflicto de versión 409 sin duplicar líneas; ingresar dos veces no duplica. Test en Tarea 11.
5. **Borrador de otro usuario o vencido:** 404 en API y herramientas; las dos entradas respetan al dueño. Test en Tarea 11.

---

### Tarea 0: Guardar especificación y plan

**Files:** Create: los dos `.md` indicados arriba. Add: los 3 HTML de `docs/` sin commitear.

- [ ] **Step 1:** Separar este archivo en Parte A y Parte B y guardarlas en esas rutas.
- [ ] **Step 2:** Commit: `docs(cubicador): compilar especificacion y plan del bot cubicador`, con los 3 HTML.

---

## Hito 0: Base segura (Fase 0 de la auditoría)

### Tarea 1: Hook `prepare` y E1, cotización abierta

**Files:** Modify: `backend/src/agent/types.ts`, `agent/loop.ts`, `agent/tools/quotationTool.ts`. Test: `agent/__tests__/pendingActions.test.ts`.

**Interfaces:**

- Produces: `AgentTool.prepare?: (args: Record<string, unknown>, ctx: AgentContext) => Promise<Record<string, unknown>>`. Devuelve los argumentos definitivos que se guardan; lanza `httpError` si no son válidos.

- [ ] **Step 1: Tests que fallan**
  - `propuesta de modificar_cotizacion guarda quotation_id de la cotización abierta`: con `ctx.quotationId='q1'`, los args insertados contienen `quotation_id:'q1'`.
  - `modificar_cotizacion sin cotización abierta no crea propuesta`: no hay `INSERT INTO agent_pending_actions`; la salida al modelo trae `error`.
  - `error de prepare viaja con opciones`: un `prepare` que lanza `httpError('x',409,{opciones:[{id:'1',name:'A'}]})` produce `output.opciones` con ese arreglo.
  - `el prompt incluye la cotización abierta`: `systemInstruction` contiene `q1`.
- [ ] **Step 2:** Correr `npx vitest run src/agent/__tests__/pendingActions.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** En la rama `write` de `loop.ts`, llamar `tool.prepare` antes de `describeWriteAction`; capturar el error y devolver `{ error, ...(payload.opciones ? { opciones } : {}) }`. Agregar al prompt `## Cotización abierta en pantalla: <id>` si existe. `modificarCotizacionTool.prepare` resuelve `args.quotation_id || ctx.quotationId`; sin id lanza `httpError(…, 422)`; verifica con `fullQuotation` (404 si no existe).
- [ ] **Step 4:** En `execute`, reemplazar el `return` con `modificada:false` por `throw httpError(…, 422)` para que la acción quede `failed` y no parezca éxito.
- [ ] **Step 5:** Correr el test. Esperado: PASS.
- [ ] **Step 6:** Commit `fix(agente): la modificacion usa la cotizacion abierta (E1)`.

### Tarea 2: E2 y E3, detalle, validación, duplicados y categoría `ins`

**Files:** Modify: `agent/tools/quotationTool.ts`, `agent/pendingActions.ts`, `frontend/src/styles/ChatPanel.css`. Test: `agent/__tests__/pendingActions.test.ts`.

- [ ] **Step 1: Tests que fallan**
  - `crear_cotizacion valida el cliente al proponer`: `findClientByName` sin filas da salida con `error`, sin INSERT.
  - `cliente ambiguo devuelve opciones al modelo`.
  - `describe muestra el detalle`: con `dias:3, dotacion:2, comuna:'Rancagua'` y material `{descripcion:'Filtro',cantidad:1,unidad:'Uni',precio_unitario:85400,categoria:'rep'}`, el resumen contiene `3 días`, `2 personas`, `Rancagua`, `Filtro` y `85.400`.
  - `propuesta igual reutiliza la pendiente`: si el `SELECT` encuentra una pendiente con mismo usuario, herramienta y args, devuelve ese id sin INSERT.
  - `acepta categoria ins`: el `enum` de `materiales` en ambas herramientas contiene `ins`, `rep`, `mo`, `log`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** `crearCotizacionTool.prepare` llama `resolveClientByName` y devuelve los args. Extraer `describeMateriales(args): string` con una línea por material y el neto de cada una, y un pie «Más colación y bono según reglas vigentes» cuando haya días. Extraer una constante `CATEGORIAS_LINEA` para el `enum`.
- [ ] **Step 4:** En `createPendingAction`, antes del INSERT: `SELECT id, expires_at … WHERE user_id=$1 AND tool=$2 AND args=$3::jsonb AND status='pending' AND expires_at>NOW() LIMIT 1`.
- [ ] **Step 5:** `.chat-pending-summary { white-space: pre-line; }`.
- [ ] **Step 6:** Correr `npx vitest run src/agent`. Esperado: PASS.
- [ ] **Step 7:** Commit `fix(agente): confirmacion con detalle y validacion al proponer (E2, E3)`.

### Tarea 3: E4, RUT fuera del historial

**Files:** Modify: `agent/tools/historyTool.ts`. Test: `agent/__tests__/goldenSet.test.ts`.

La auditoría proponía además buscar por RUT. No se hace: `scrubPii` ya borra el RUT de la instrucción, así que el modelo nunca lo recibe. Se corrige la descripción para que diga solo «nombre».

- [ ] **Step 1:** Test `el historial no entrega el RUT al modelo`: `JSON.stringify(output)` no contiene el RUT del cliente falso ni la clave `rut`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Quitar `rut` del payload y ajustar la descripción de la herramienta.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `fix(agente): el historial no expone RUT al LLM (E4)`.

---

## Hito 1: Núcleo del cubicador

### Tarea 4: Tipos, migración y borradores

**Files:** Create: `backend/src/db/migrations/1700000027000_0027-cubicador.js`, `backend/src/cubicador/types.ts`, `cubicador/borradores.ts`. Test: `cubicador/__tests__/borradores.test.ts`.

**Interfaces (Produces, `types.ts`):**

```ts
export type PerfilId = 'hvac' | 'cierre_metalico'
export type EstadoPregunta = 'pendiente' | 'respondida' | 'no_sabe'
export type CategoriaLinea = 'mo' | 'log' | 'mat' | 'rep' | 'ins' | 'mec' | 'ele'
export interface Supuesto {
  clave: string
  texto: string
  critico: boolean
}
export interface Ficha {
  descripcion: string
  datos: Record<string, unknown>
  no_sabe: string[]
  supuestos: Supuesto[]
}
export interface ItemListado {
  id: string
  categoria: CategoriaLinea
  descripcion: string
  unidad: string
  cantidad: number
  dias: number
  formula: string
  precio_unitario: number | null
  fuente: 'catalogo' | 'cache' | 'tienda' | null
  tienda?: string
  fuente_url?: string
  estado_precio: 'pendiente' | 'con_precio' | 'sin_precio'
}
export interface ResultadoCubicacion {
  items: ItemListado[]
  supuestos: Supuesto[]
  advertencias: string[]
  dotacion: {
    personas: number
    dias: number
    hh_calculadas: number
    hh_cotizadas: number
    holgura_hh: number
  } | null
}
export interface Borrador {
  id: string
  user_id: string
  tenant_id: string | null
  quotation_id: string | null
  perfil: PerfilId
  estado: 'entrevista' | 'cubicado' | 'ingresado' | 'cancelado'
  ficha: Ficha
  resultado: ResultadoCubicacion | null
  version: number
  expires_at: string
}
```

`borradores.ts`: `crearBorrador(pool, input)`, `obtenerBorrador(pool, id, userId)` (null si es ajeno o venció), `borradorActivo(pool, userId)`, `actualizarBorrador(pool, id, userId, cambios, versionEsperada)` (lanza `httpError(…,409)` si la versión cambió).

- [ ] **Step 1: Tests que fallan:** `obtenerBorrador no entrega un borrador ajeno`; `actualizarBorrador con versión vieja lanza 409`; `borradorActivo ignora ingresado y vencido`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Migración con `CREATE TABLE IF NOT EXISTS`: `cubicador_borradores` (`id UUID PK DEFAULT gen_random_uuid()`, `tenant_id UUID`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `quotation_id UUID`, `perfil TEXT`, `estado TEXT CHECK (…)`, `ficha JSONB`, `resultado JSONB`, `version INT DEFAULT 1`, `expires_at TIMESTAMPTZ DEFAULT NOW()+INTERVAL '7 days'`, timestamps, índice `(user_id, estado)`) y `cubicador_parametros` (`clave TEXT PK`, `tenant_id UUID`, `valor JSONB NOT NULL`, `updated_at`). `down` borra solo esas dos tablas.
- [ ] **Step 4:** Implementar `borradores.ts`.
- [ ] **Step 5:** Correr. Esperado: PASS.
- [ ] **Step 6:** Commit `feat(cubicador): tablas y repositorio de borradores`.

### Tarea 5: Perfiles y compuerta

**Files:** Create: `cubicador/perfiles.ts`, `cubicador/compuerta.ts`. Test: `cubicador/__tests__/compuerta.test.ts`.

**Interfaces (Produces):**

```ts
export interface PreguntaPerfil {
  clave: string
  texto: string
  completa: (datos: Record<string, unknown>) => boolean
  impacto: number
}
export interface PerfilEntrevista {
  id: PerfilId
  minimo: number
  todasObligatorias: boolean
  preguntas: PreguntaPerfil[]
  segundoNivel: (datos: Record<string, unknown>) => string[]
}
export const PERFILES: Record<PerfilId, PerfilEntrevista>
export interface EstadoCompuerta {
  respondidas: number
  requeridas: number
  habilitado: boolean
  faltantes: string[]
  siguientes: string[]
}
export function evaluarCompuerta(perfil: PerfilEntrevista, ficha: Ficha): EstadoCompuerta
```

`siguientes` trae hasta 3 textos por `impacto`. `segundoNivel` activa las filas de borde de los diseños según los datos, por ejemplo chapa eléctrica → sin energía, respaldo, tablero, canalización; R-32 → tamaño del local.

- [ ] **Step 1: Tests que fallan**
  - `caso R-404A sin placa ni succión ni estado: 1 de 3, deshabilitado`, con faltantes `refrigerante_lineas` y `estado_sistema`.
  - `no_sabe cuenta`: al agregar esas dos claves a `no_sabe`, da 3 de 3 y habilitado.
  - `todo en el primer mensaje habilita sin preguntar`.
  - `Gemini no puede afirmar sin datos`: `datos` con solo `tipo_trabajo` no completa `trabajo_equipo`.
  - `cierre_metalico`: con 2 respuestas no habilita; con 3 de 5 sí.
  - `siguientes nunca trae más de 3`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar según A3.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): perfiles de entrevista y compuerta del servidor`.

---

## Hito 2: Calculadoras HVAC

### Tarea 6: Parámetros y refrigerante

**Files:** Create: `cubicador/params.ts`, `cubicador/calc/refrigerante.ts`. Test: `cubicador/__tests__/refrigerante.test.ts`.

**Interfaces (Produces):**

- `PARAMETROS_BASE` y `cargarParametros(pool): Promise<Parametros>`. Mezcla la tabla `cubicador_parametros` sobre la base; si la consulta falla, usa la base.
- `Parametros` contiene:
  - `cobre`: 1/4 → 4,75 mm; 3/8 → 7,92; 1/2 → 11,1; 5/8 → 14,28; 3/4 → 17,45; 7/8 → 20,6.
  - `refrigerantes`: R-410A `{densidad_liquido_kg_l:1.06, kg_cilindro:11.3}`; R-404A `{1.045, 10.9, densidad_vapor_kg_l:0.0195}`; R-32, R-134a, R-407C, R-22 con valores marcados `// validar`.
  - `merma_pct:5`, `bombeo:{tramo:0.2,merma:0.3,holgura:0.5}`.
- `volumenLinea(diam, largoM, params): number`, litros.
- `calcularRefrigerante(input: EntradaRefrigerante, params): ResultadoRefrigerante`, con `{kg, cilindros, kg_cilindro, sobrante_kg, formula}`. Entrada: `{tipo_trabajo, sistema, refrigerante, metodo:'total'|'bombeo', carga_placa_kg?, largo_incluido_m, lineas, reutilizable_kg}`.

- [ ] **Step 1: Tests que fallan**
  - `VRF R-410A`: placa 8,5, líquido 3/8 40 m, gas 3/4 40 m → `kg` 11,1; 1 cilindro de 11,3.
  - `cámara R-404A con recuperación total`: placa 4,0, 3/8 20 m, 7/8 20 m → 5,4 kg; 1 cilindro de 10,9; sobrante 5,5.
  - En la misma cámara: `placa de 9 kg sigue en 1 cilindro`; `placa de 10 kg pide 2`.
  - `bombeo` → 1,0 kg.
  - `reutilizable resta`: 2 kg reutilizables en el caso VRF → `(10,58 − 2) × 1,05` = 9,0.
  - `instalación con línea menor a la incluida` → 0.
  - `diámetro desconocido lanza httpError 422`; `largo negativo lanza 422`; `refrigerante desconocido lanza 422`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar. El volumen usa `π/4 × d²`. `formula` deja la cuenta legible en español.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): calculadora de refrigerante`.

### Tarea 7: Nitrógeno

**Files:** Create: `cubicador/calc/nitrogeno.ts`. Modify: `cubicador/params.ts`. Test: `cubicador/__tests__/nitrogeno.test.ts`.

**Interfaces (Produces):** `calcularNitrogeno(input: EntradaNitrogeno, params): {m3, balones, formula}`. Entrada: `{volumen_l, presion_barg, presion_max_placa_barg?, minutos_soldadura, barridos?}`. También `presionPrueba(refrigerante, params)`: R-410A y R-32 37,9 barg (los 550 psi de la plantilla); el resto 9 barg, marcado como supuesto crítico. Parámetros: `caudal_lpm:3`, `holgura:1.3`, `min_por_union:15`, `balon_m3:6`, `barridos_flushing:3`, `presion_barrido_barg:5`.

- [ ] **Step 1: Tests que fallan**
  - `VRF`: `volumen_l` 25,02, 37,92 barg, 40 min → `m3` 1,39; 1 balón.
  - `caso R-404A`: 1 L, 9 barg, 30 min → 0,13; 1 balón.
  - `la placa topa la presión`: máximo 20 barg da menos que 37,92.
  - `flushing suma 3 barridos`: 25 L a 5 barg agrega `25×5×3×1,3 = 487,5` L.
  - `10 m³ pide 2 balones`; `volumen negativo lanza 422`; `volumen 0 sin soldadura da 0 balones`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): calculadora de nitrogeno`.

### Tarea 8: Horas-hombre y dotación

**Files:** Create: `cubicador/calc/horasHombre.ts`, `cubicador/calc/dotacion.ts`. Modify: `cubicador/params.ts`. Test: `cubicador/__tests__/horasHombre.test.ts`.

**Interfaces (Produces):**

- `listaTareas(datos, params): TareaHH[]` y `calcularHH(tareas, factor): {filas, total}`.
- `sugerirDotacion({hh, tecnicos=1, ayudantes=1, jornadas_fijadas?}, params): {personas, dias, hh_calculadas, hh_cotizadas, holgura_hh}`.
- Parámetros con valores de los diseños (iniciales, a calibrar):
  - `reparacion_fuga`: diagnóstico 6, recuperación 3, presurización 8, soldadura y filtro 8, vacío 4, control de estanqueidad 2, recarga y puesta en marcha 4, informe 2.
  - `puesta_a_punto`: revisión 3, recuperación 2, filtro 3, prueba 1,5, vacío 3, carga 2, ajuste de válvula 4, puesta en marcha e informe 3.
  - `instalacion`: interior 2 c/u, exterior 3 c/u, línea 0,4/m, vacío 3, puesta en marcha 2, informe 1.
  - `eficiencia:0.85`, `horas_jornada:8`.

- [ ] **Step 1: Tests que fallan**
  - `reparación de fuga suma 37 HH` → 2 personas, 3 días, sin holgura.
  - `puesta a punto suma 21,5 HH` → 2 días.
  - `2 jornadas fijadas`: `hh_cotizadas` 32, `holgura_hh` 10,5.
  - `jornadas fijadas menores a lo calculado`: 1 jornada da 16 HH, `holgura_hh` −5,5, y el motor advertirá.
  - `instalación con 1+1 unidades y 12 m` suma `2+3+4,8+3+2+1 = 15,8`.
  - `factor de dificultad 1,2` multiplica el total.
  - `actividad flushing suma 6 HH de barridos` a `reparacion_fuga`: total 43 HH (`hh_barrido: 2` por cada uno de los 3 barridos).
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): horas-hombre y dotacion sugerida`.

### Tarea 9: Motor HVAC y criterios

**Files:** Create: `cubicador/criterios.ts`, `cubicador/motorHvac.ts`, `cubicador/motor.ts`. Test: `cubicador/__tests__/motorHvac.test.ts`.

**Interfaces (Produces):**

- `DatosHvac` (Zod `datosHvacSchema`): `tipo_trabajo`, `sistema` (`split|multisplit|vrf|precision|camara|central`), `actividad` (`fuga|puesta_a_punto|flushing|instalacion`), `refrigerante`, `metodo`, `carga_placa_kg`, `largo_incluido_m`, `lineas`, `volumen_equipos_l`, `alcance_prueba` (`tramo|circuito|lineas`), `presion_max_placa_barg`, `uniones`, `reutilizable_kg`, `unidades_interiores`, `unidades_exteriores`, `factor_dificultad`, `jornadas_fijadas`, `tecnicos`, `ayudantes`, `comuna`, `estado_texto`.
- `CRITERIOS_REPARACION`: los 10 de la sección 5 del diseño HVAC, como `{clave, situacion, criterio, efecto}`.
- `cubicar(perfil: PerfilId, ficha: Ficha, params: Parametros): ResultadoCubicacion`. Para `no_sabe` aplica el supuesto de `params.ts` y lo marca crítico: sin `carga_placa_kg` usa `placa_supuesta_kg: 4.0`. `alcance_prueba` por defecto: `tramo` en `puesta_a_punto` (con `volumen_tramo_l: 1`), `circuito` en `fuga` y `flushing`, `lineas` en `instalacion`.

- [ ] **Step 1: Tests que fallan**
  - **Caso R-404A completo:** `camara`, `puesta_a_punto`, total, placa `no_sabe`, 3/8 y 7/8 de 20 m, 2 uniones, 2 jornadas → R-404A 5,4 kg en `ins`; nitrógeno 0,13 m³ en `ins`; filtro secador de 3/8 en `rep`; soldadura en `ins`; `Técnico Especializado HVAC` 16 h y `Ayudante Técnico HVAC` 16 h en `mo` con unidad `Hora`, `dias:1`; supuesto crítico `carga_placa_kg`; advertencia que menciona `R-404A`.
  - **VRF:** fuga, sin jornadas → 37 HH, 3 días, 18,5 h por rol.
  - `mantenimiento lanza 422 y deriva a cubicar_especificacion_hvac`.
  - `compresor quemado`: flushing agrega aceite y filtros, y `reutilizable_kg` queda en 0 aunque se indique otro valor.
  - `R-32 agrega advertencia de carga máxima`; `R-22 agrega advertencia de disponibilidad`.
  - `datos inválidos lanzan 422`, sin NaN en ninguna cantidad.
  - `CRITERIOS_REPARACION tiene 10 entradas`.
  - `todos los items quedan con estado_precio pendiente`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar `motorHvac` y `motor.ts` (despacho por perfil; `cierre_metalico` llega en la Tarea 10).
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): motor HVAC con criterios de reparacion`.

---

## Hito 3: Cierre metálico y eléctrico

### Tarea 10: Calculadoras de reja y acceso eléctrico

**Files:** Create: `cubicador/calc/cierreMetalico.ts`, `cubicador/calc/accesoElectrico.ts`, `cubicador/motorCierre.ts`. Modify: `cubicador/motor.ts`. Test: `cubicador/__tests__/motorCierre.test.ts`.

**Interfaces (Produces):** `calcularCierre(d: DatosCierre, params)` y `calcularAcceso(d: DatosAcceso, params)`, ambas devuelven `ItemListado[]`. Por defecto: separación de postes 2 m, empotrado 0,6 m, 3 travesaños, merma 10 %, tira 6 m, hoyo 0,3×0,3×0,6 m, 3 bisagras por hoja, recorte de barrote 0,6 m.

- [ ] **Step 1: Tests que fallan** (reja 8 × 3 con puerta 0,9 × 2,2)
  - `5 postes de 3,6 m`; `perfil 40x40x2: 46,4 m, con merma 51,04 m, 9 tiras` en `mec`.
  - `60 barrotes de 2,4 m, 158,4 m` con barrotes 20x20 cada 0,12 m.
  - `3 bisagras`; `hormigón 0,27 m³` en `mat`.
  - `cierre sólido reemplaza barrotes por plancha` y agrega rigidizadores.
  - `anclaje con placa`: sin hormigón empotrado; agrega placas y pernos.
  - `acceso`: 25 m enterrados y 7,5 m por poste → cable 36 m, cañería 25 m, 2 cámaras, en `ele`; automático y diferencial 1 + 1.
  - `sin chapa eléctrica no agrega ítems ele`.
  - `dotación se calcula y la tramitación no aparece` en ningún ítem.
  - `alto o largo inválido lanza 422`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar y conectar en `motor.ts`. Rendimientos de soldador y electricista en `params.ts`, marcados como iniciales.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): calculadoras de cierre metalico y acceso electrico`.

---

## Hito 4: Integración con el agente y el chat

### Tarea 11: Herramientas, entrada única e ingreso

**Files:** Create: `cubicador/ejecutar.ts`, `cubicador/ingreso.ts`, `agent/tools/cubicadorTools.ts`. Modify: `agent/types.ts`, `agent/registry.ts`, `agent/loop.ts`, `api/chatbot.ts`. Test: `cubicador/__tests__/ejecutar.test.ts`, `agent/__tests__/cubicadorTools.test.ts`.

**Interfaces:**

- Consumes: `prepare` (T1), `evaluarCompuerta` (T5), `cubicar` (T9), `addLinesToQuotationOp`, `createQuotationOp`, `resolveClientByName`.
- Produces:
  - `ejecutarCubicacion(pool, borradorId, userId): Promise<EstadoCubicador>`. Lanza `httpError(…,422,{faltantes})` si la compuerta está cerrada. Es la única entrada al cálculo.
  - `EstadoCubicador`: `{ borrador_id, perfil, estado, compuerta: EstadoCompuerta, datos_completos, datos_totales, resultado: ResultadoCubicacion|null, precios_pendientes: number }`.
  - `estadoCubicador(borrador): EstadoCubicador`, y `resumirFicha(borrador): string` para el prompt (con `scrubPii`).
  - `aLineas(resultado): ImportLinea[]`. Incluye los ítems `sin_precio` con precio 0, para que `manualItemsWarning` avise.
  - Herramientas:
    - `entrevistar_obra` (read; `{perfil, descripcion, datos, no_sabe}`): crea o actualiza, y devuelve compuerta y `siguientes`.
    - `cubicar_borrador` (read): llama a `ejecutarCubicacion`; con compuerta cerrada devuelve `{bloqueado:true, faltantes}` sin lanzar.
    - `ajustar_listado` (read; `{datos?, quitar_items?, cambios_item?}`): cambia datos y recalcula sin LLM; respeta los precios ya resueltos de ítems sin cambios.
    - `ingresar_listado_a_cotizacion` (write; `{cliente_nombre?}`): `prepare` toma una foto de las líneas y `version` del borrador, resuelve la cotización abierta o el cliente, y lanza 422 si no hay ninguno.
  - `AgentContext.cubicadorContexto?: string`, `AgentToolResult.cubicador?: EstadoCubicador`, `AgentRunResult.cubicador?`.

- [ ] **Step 1: Tests que fallan**
  - `procede con compuerta cerrada no cubica`: `{bloqueado:true}` con `faltantes`, y `resultado` sigue null.
  - `entrevistar_obra fusiona datos sin perder los anteriores`.
  - `borrador ajeno da 404` en `ejecutarCubicacion` y `no encontrado` en las herramientas.
  - `ingresar propone una acción con todas las líneas`: `describe` lista cada ítem, sus supuestos críticos y el total; los args contienen la foto.
  - `ingresar sin cotización ni cliente pide el dato`.
  - `ingresar agrega a la cotización abierta y marca el borrador ingresado`.
  - `confirmar dos veces no duplica`: segunda ejecución con estado `ingresado` lanza 409 sin llamar `addLinesToQuotationOp`.
  - `borrador cambiado después de proponer lanza 409`.
  - `dotación y comuna llegan a addLinesToQuotationOp`, para que `buildAutoLineItems` agregue colación y bono.
  - `el prompt lleva la ficha activa`; `el resultado del agente propaga cubicador`.
  - `texto con RUT se guarda limpio`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Registrar las 4 herramientas con `roles: ['admin','commercial','engineer']`. En `chatbot.ts`, antes de `runAgentLoop`, leer `borradorActivo` (degradar a vacío si falla) y devolver `cubicador` en la respuesta. Agregar al prompt: no calcular cantidades, llamar `entrevistar_obra` por turno con lo nuevo, y llamar `cubicar_borrador` solo ante «procede» o «cubica».
- [ ] **Step 4:** Correr `npx vitest run src/cubicador src/agent`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): herramientas del agente e ingreso aprobado`.

### Tarea 12: API del botón y tarjeta en el chat

**Files:** Create: `backend/src/api/cubicador.ts`, `frontend/src/components/CubicadorCard.tsx`. Modify: `backend/src/app.ts`, `frontend/src/api/api.ts`, `frontend/src/stores/chatStore.ts`, `frontend/src/components/ChatPanel.tsx`, `frontend/src/styles/ChatPanel.css`. Test: `backend/src/api/__tests__/cubicador.test.ts`, `frontend/src/stores/__tests__/chatStore.test.ts`.

**Interfaces (Produces):**

- `POST /api/chatbot/cubicador/:id/cubicar` responde `EstadoCubicador` sin LLM. Montar en `app.ts` **antes** de `app.use('/api/chatbot', …)`, con `authMiddleware` y `validate({ params: uuidParams('id') })`.
- `api.cubicarBorrador(id)` y `ChatMessageResponse.cubicador?: EstadoCubicador`.
- `chatStore.cubicarDesdeBoton(borradorId, quotationId)`, que agrega al historial un mensaje de bot con `data.cubicador`.

- [ ] **Step 1: Tests que fallan**
  - Backend: `sin sesión 401`; `compuerta cerrada 422 con faltantes`; `borrador ajeno 404`; `cubica y devuelve resultado`.
  - Frontend: `cubicarDesdeBoton agrega el listado`; `no manda dos veces con doble clic`; `error 422 se muestra como mensaje`.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar. `CubicadorCard`:
  - Contador «N de 3 respuestas» y, habilitado, «X de Y datos · Z supuestos».
  - Botón Cubicar deshabilitado hasta `compuerta.habilitado`.
  - Tabla por categoría con cantidad, fórmula plegable, precio y enlace (solo `http(s)`), «sin precio» y supuestos resaltados.
  - Tablas con scroll propio dentro del panel.
  - Nombres visibles: Provisión de Materiales, Insumos Industriales y Gases, Materiales Mecánico, Materiales Eléctricos.
- [ ] **Step 4:** Correr las pruebas. Esperado: PASS.
- [ ] **Step 5:** Verificar en el navegador con `preview_start`: flujo del caso R-404A con el LLM simulado o real, con captura de pantalla y consola sin errores.
- [ ] **Step 6:** Commit `feat(cubicador): boton Cubicar y listado en el chat`.

---

## Hito 5: Precios por etapas

### Tarea 13: Resolutor de precios en lotes

**Files:** Create: `cubicador/precios.ts`. Modify: `services/llm.ts`, `services/chatbotOps.ts`, `agent/tools/specCubicatorTool.ts`, `api/cubicador.ts`, `frontend/src/stores/chatStore.ts`, `frontend/src/api/api.ts`. Test: `cubicador/__tests__/precios.test.ts`, `services/__tests__/llm.test.ts` (crear si no existe).

**Interfaces (Produces):**

- `export function matchCatalogRow` desde `specCubicatorTool.ts`, sin duplicarla.
- `lookupMaterialPrice(…, opts: { timeoutMs?; tiendas?: string[] })`. Con `tiendas`, el prompt pide solo esas y `muestras` se filtra por `tienda`.
- `resolverPrecios(pool, borradorId, userId, ctx): Promise<EstadoCubicador>`:
  1. Sin LLM: catálogo (`catalog_items` y el catálogo eléctrico) y luego caché (nodo `materialNodeId`, `last_price` con `last_price_at` ≤ `PRECIO_STALE_DAYS`).
  2. Hasta 3 ítems `pendiente` en paralelo con `Promise.allSettled` y `timeoutMs: 15_000`; `TIENDAS_RETAIL = ['Sodimac','Easy','Imperial','Punto Maestro']`. Elige la muestra más barata válida.
  3. Error o precio 0 → `sin_precio`. Guarda con control de versión.
- Gas, nitrógeno y mano de obra no van a tiendas retail: solo catálogo o caché; si no, `sin_precio`.
- `POST /api/chatbot/cubicador/:id/precios`, con throttle propio de 30 por minuto.
- `chatStore` llama en bucle mientras `precios_pendientes > 0`, con tope de 10 vueltas, y actualiza la tarjeta.

- [ ] **Step 1: Tests que fallan**
  - `callLlm con tools no usa el LLM local`: con `LLM_ROUTING_STRATEGY` híbrido y `tools:[{google_search:{}}]`, no se llama `postOpenAiCompatible`.
  - `local_only con tools lanza 503` en lugar de inventar.
  - `catálogo primero, sin LLM`; `caché de 10 días sirve, de 30 no`.
  - `lote de máximo 3`, `precios_pendientes` baja hasta 0 en varias llamadas.
  - `una tienda que falla deja sin_precio y no tumba el lote`.
  - `R-404A sin catálogo queda sin_precio, sin llamar tiendas`.
  - `elige la muestra más barata válida`; `URL javascript: se descarta`; `muestra de otra tienda se descarta`.
  - `un ajuste por chat no borra precios resueltos` de ítems sin cambios.
- [ ] **Step 2:** Correr. Esperado: FAIL.
- [ ] **Step 3:** Implementar. En `callLlm`: `if (strategy !== 'cloud_only' && localConfig && !opts.tools?.length)`, y con `local_only` más `tools` lanzar `httpError(…,503)`.
- [ ] **Step 4:** Correr. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(cubicador): precios por etapas en lotes`.

### Tarea 14: Verificación final

**Files:** Test: `agent/__tests__/goldenSet.test.ts`. Modify: `docs/DISENO_CUBICADOR_HVAC_REFRIGERACION.html` solo si los números cambian.

- [ ] **Step 1:** Agregar 3 casos al golden set con el LLM simulado: reja del diseño, VRF y cámara R-404A, de la entrevista al ingreso.
- [ ] **Step 2:** Correr `cd backend && npm test && npm run lint && npm run build`. Esperado: sin fallos.
- [ ] **Step 3:** Correr `cd frontend && npm test && npm run lint && npm run build`. Esperado: sin fallos.
- [ ] **Step 4:** Correr la migración 0027 sobre una rama Neon de prueba, nunca directo en producción, y verificar con `\d cubicador_borradores`.
- [ ] **Step 5:** `graphify update .`
- [ ] **Step 6:** Commit `test(cubicador): casos de punta a punta en golden set`.

## Verificación end-to-end

1. En modo Agente, pegar el mensaje del caso R-404A: el bot pregunta y el botón muestra «1 de 3 respuestas».
2. Responder «no tengo la placa, supón; funciona sin síntomas»: el botón se habilita.
3. Pulsar Cubicar: 5,4 kg (1 cilindro), 0,13 m³ (1 balón), 32 HH con 10,5 de holgura y supuesto crítico de placa.
4. Los precios llegan a la misma tarjeta; lo que no tenga fuente dice «sin precio».
5. Confirmar: líneas en sus categorías, con colación según reglas. Un segundo clic no duplica.

## Entrega

PR por hito, con Hito 0 primero porque corrige errores que ya están en producción.
