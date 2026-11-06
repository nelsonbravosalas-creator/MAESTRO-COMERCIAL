# Bot Cubicador Agéntico: especificación

## Contexto

El bot del Maestro Comercial sabe buscar en catálogo y proponer escrituras, pero no dimensiona obras ni entrevista. Tres documentos fijan lo que debe hacer: la auditoría `docs/QA_BOT_MAESTRO_COMERCIAL.html` (E1–E4 bloquean cualquier ampliación), `docs/DISENO_BOT_AGENTICO_CUBICADOR.html` (reja, cierre y eléctrico) y `docs/DISENO_CUBICADOR_HVAC_REFRIGERACION.html` (HVAC y refrigeración). Este plan los compila en un solo motor con dos perfiles.

## A1. Objetivo

Desde un requerimiento en texto libre, el bot entrevista como técnico de terreno, cubica con fórmulas fijas, presenta un listado por categoría con precios con fuente y, tras aprobación en el chat, lo ingresa a la cotización. Gemini es el cerebro que entrevista; **Gemini entiende, el código calcula, el servidor decide**.

## A2. Decisiones tomadas

| Tema         | Decisión                                                                                             | Origen                           |
| ------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| Arquitectura | Enfoque B: Gemini entiende, código calcula                                                           | Tu aprobación al pedir este plan |
| Precios      | Híbrido por etapas: catálogo → caché 25 días → Gemini + Google en 4 tiendas → scraping solo si falla | Respuesta tuya                   |
| Mano de obra | Materiales y dotación sugerida; tramitación fuera                                                    | Respuesta tuya                   |
| Compuerta    | Botón Cubicar y «procede» se habilitan con 3 respuestas                                              | Respuesta tuya                   |
| HVAC         | Cubica refrigerante (kg), nitrógeno (m³) y HH, con 3 preguntas de contexto                           | Respuesta tuya                   |
| Caso R-404A  | Recuperación total; placa 4,0 kg como supuesto crítico; 2 jornadas fijadas mandan                    | Respuesta tuya                   |

**Propuestas por defecto que tomo como aceptadas al pedir la compilación (corrígeme al revisar):**

- Reja: precio de tienda como costo unitario con margen de la cotización por categoría; se recomienda la tienda más barata con fuente válida, cambiable por chat; se parte por rejas y cierres con chapa eléctrica; se ingresa a la cotización abierta y, si no hay, se propone crear una con confirmación.
- HVAC: rendimientos desde plantillas y calibración posterior; gas recuperado no se reutiliza salvo marca; estanqueidad de 24 h como dos visitas de control; primero reparación e instalación.

## A3. Comportamiento

**Compuerta.** La evalúa `evaluarCompuerta` en el servidor; Gemini no puede saltársela. Un `no_sabe` cuenta como respuesta y crea un supuesto crítico. Los perfiles definen sus preguntas:

- `hvac`: 3 obligatorias. `trabajo_equipo` exige `tipo_trabajo` y `sistema`. `refrigerante_lineas` exige `refrigerante`, `carga_placa_kg`, línea de líquido y línea de gas con diámetro y largo. `estado_sistema` exige `estado_texto`.
- `cierre_metalico`: mínimo 3 respuestas entre `medidas`, `tipo_cierre`, `anclaje`, `cerradura`, `comuna`.

Con el mensaje del caso R-404A (sin placa, sin succión, sin estado) la compuerta da 1 de 3. Lo ya respondido no se pregunta de nuevo. Máximo 3 preguntas por mensaje, ordenadas por impacto en costo.

**Fórmulas HVAC**

- Refrigerante, reparación con recuperación total: `(placa + adicional_líquido + vapor_succión − reutilizable) × (1 + merma 5 %)`. `vapor_succión` solo para `camara` y `central`; split y VRF se tabulan por línea de líquido.
- Bombeo: tramo abierto 0,2 kg + merma 0,3 kg + holgura 0,5 kg. Instalación: `max(0, largo_líquido − incluido) × g/m × (1 + merma)`. Se redondea a 1 decimal y a cilindros enteros, mostrando sobrante.
- Nitrógeno: `(V × P_barg + caudal × minutos) × 1,3`, con `P` topada por la placa, redondeo a 2 decimales y balones enteros de 6 m³. `V` según alcance: tramo, circuito o líneas. Con flushing suma 3 barridos a 5 barg.
- HH: `Σ tarea × cantidad × factor`. `días = ceil(HH / (personas × 8 × 0,85))`. Si fijas jornadas, se cotizan `personas × jornadas × 8` y se muestra la holgura.
- Mantenimiento: no se cubica aún; deriva a `cubicar_especificacion_hvac`.

**Criterios de reparación.** Los 10 de la sección 5 del diseño HVAC son datos en `criterios.ts`, cada uno con su efecto. R-22, R-404A y R-32 generan advertencias; R-32 pide verificar carga máxima, sin calcularla.

**Categorías.** `ins` gas, nitrógeno, soldadura y consumibles; `mo` HH; `mat` cobre, aislación y hormigón; `mec` perfiles y herrajes; `ele` eléctricos; `rep` repuestos como filtro secador. Colación y bono los agrega `buildAutoLineItems`.

**Precios.** Primero cantidades, catálogo y caché; luego lotes de hasta 3 ítems contra las 4 tiendas. Sin dato confiable el ítem queda «sin precio». Nunca se inventa.

**Aprobación.** Una sola acción pendiente con todas las líneas en sus argumentos. Se confirma lo que se mostró.

## A4. Fuera de alcance

Scraping con Apify, mantenimiento por contrato, retrofit, chillers, portón motorizado, cerco energizado, tramitación SEC, aprendizaje real contra cubicado y pantalla de edición de parámetros (se editan por tabla).
