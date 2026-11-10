# Mantenciones: presentación resumida, subsistemas y repuestos consumibles (diseño)

Fecha: 2026-11-09. Maqueta revisada por el usuario: https://claude.ai/artifact/W5z4yPvutgX5nWc6qs2C9E

## Objetivo

La cotización de mantención (`kind='maintenance'`) hoy tiene una sola valorización, desglosada por categoría de costeo. El usuario necesita presentar la propuesta como la envía al cliente:

1. **Presentación resumida** (check): una fila por servicio, con texto descriptivo editable y el valor total por intervención, en vez del desglose por categoría.
2. **Varias valorizaciones** (botón "Agregar valorización"): cada sistema o subsistema con costeo, régimen, horario y moneda propios, en el mismo documento.
3. **Repuestos consumibles** (check por valorización): valorizador opcional con frecuencia de cambio y precio desde el Maestro de Precios más margen.
4. **Cuadro resumen final** (check): suma servicios y consumibles de todas las valorizaciones. Disponible en ambas presentaciones.

## Decisiones tomadas con el usuario

| Tema                               | Decisión                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| Qué lleva propio cada valorización | Costeo completo, régimen, horario, moneda, texto y consumibles                           |
| Regímenes                          | Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual, Especial (meses), Único |
| Horario                            | Selector por valorización: hábil, inhábil, 24x7                                          |
| Texto editado a mano               | Se conserva al cambiar el régimen; botón "Restablecer texto"                             |
| Consumibles                        | Uno por valorización; precio = costo del Maestro + margen de la sección                  |
| Totales                            | Cada sección con su total; cuadro resumen final opcional                                 |
| Moneda                             | Selector por valorización: CLP, UF, USD                                                  |

## Supuestos (no confirmados; cambiar aquí si el usuario corrige)

- S1. Enfoque de datos A: columna JSONB en `quotations`, sin tabla nueva.
- S2. En presentación resumida: Cant. = visitas del año, Precio unit. = neto por visita, Precio total = neto por visita × visitas.
- S3. "Especial" = cada N meses, N entero de 1 a 12; visitas del año = `max(1, round(12 / N))`.
- S4. "Único" = 1 visita; no se muestra bloque anual; no genera períodos de facturación pendientes.
- S5. El check de presentación resumida aplica a todo el documento.
- S6. La frase "desde ítem A) hasta el ítem H)" es texto fijo dentro del texto editable.
- S7. El cuadro resumen final se expresa siempre en CLP.
- S8. UF y USD usan los valores de referencia que ya tiene la cotización (`uf`, `usd`).

## Modelo de datos

Columna nueva `quotations.mtc_config JSONB NULL`. `NULL` = mantención anterior a este cambio (una sola valorización, presentación detallada, sin consumibles); se lee como tal sin migrar filas.

```ts
type MtcFrequency =
  | 'mensual'
  | 'bimestral'
  | 'trimestral'
  | 'cuatrimestral'
  | 'semestral'
  | 'anual'
  | 'especial'
  | 'unico'
type MtcSchedule = 'habil' | 'inhabil' | 'continuo'

interface MtcConsumableRow {
  id: string
  desc: string
  unidad: string
  per_module: number
  modules: number
  changes_per_year: number
  cost: number // costo unitario CLP
}
interface MtcConsumables {
  enabled: boolean
  margin: number
  rows: MtcConsumableRow[]
}

interface MtcSystem {
  id: string
  name: string
  frequency: MtcFrequency
  special_months: number | null
  schedule: MtcSchedule
  currency: 'CLP' | 'UF' | 'USD'
  summary_text: string | null // null = texto generado
  consumables: MtcConsumables
  categories: CostCategory[] | null // null en el sistema cuyo costeo vive en la cotización
  items: Record<CategoryId, CostItem[]> | null
}
interface MtcConfig {
  v: 1
  summary_mode: boolean
  show_summary_table: boolean
  systems: MtcSystem[] // 1 a 12
}
```

Reglas:

- **Sistema 1** (`systems[0]`): su costeo sigue en `quotation_categories` / `quotation_line_items`, sin cambios. En la base, `systems[0].categories` e `items` son siempre `null`.
- **Sistemas 2 en adelante**: costeo dentro del JSON, con la misma forma que usa el frontend.
- **Espejo del Sistema 1**: `quotations.frequency` y `visits_per_year` siempre copian los valores de `systems[0]`. Así el listado, la facturación y el chatbot siguen leyendo lo de siempre. `display_currency` se deriva de `systems[0].currency` en el frontend al cargar; el backend hoy no persiste esa columna (defecto previo, fuera de alcance).
- El enum `mtc_frequency` gana `bimestral`, `cuatrimestral`, `especial`, `unico`.

## Edición del costeo por sistema

`TabCosteo` y `CosteoRow` operan sobre `q.categories` / `q.items` y no se modifican. Para costear otro sistema se **intercambia**: el frontend mantiene `mtc_active_system` (solo local, no se persiste); al seleccionar el sistema _k_, el costeo en pantalla se guarda en el casillero del sistema activo y el del sistema _k_ pasa a `q.categories` / `q.items`. Al guardar se vuelve siempre al Sistema 1 antes de serializar.

## Cálculo

- Neto por visita de un sistema = suma de venta por categoría (regla de margen actual).
- Neto anual = neto por visita × visitas.
- Consumible: cantidad = `per_module × modules × changes_per_year`; precio unitario = `round(cost / (1 − margin/100))`; total = unitario × cantidad. Margen acotado a 0–90.
- Resumen final: por sistema, una fila de servicio anual y, si tiene consumibles activos, una fila de consumibles; neto, IVA (`q.iva`) y total, en CLP.
- Conversión de moneda: funciones existentes de `currencyHelper` sobre montos CLP; los cálculos base no cambian.

## Texto por defecto

Con `{Label}` = nombre del régimen, `{label}` en minúsculas, `{horario}` = "horario hábil" | "horario inhábil" | "régimen 24x7", `{intervalo}` = "cada mes" | "cada dos (2) meses" | "cada tres (3) meses" | "cada cuatro (4) meses" | "cada seis (6) meses" | "una vez al año" | "cada N meses":

```
C/u. Servicio de Mantención Preventiva (visita {Label} en {horario}).
Cada Servicio, se realiza considerando frecuencia {label} de visita ({intervalo}), para completar el periodo de Un (1) año. Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.
```

Régimen Único:

```
Servicio de Mantención Preventiva (visita única en {horario}).
Detalles del servicio se indican desde ítem A) hasta el ítem H) de la presente propuesta.
```

## Interfaz

- **Pestaña Base**: tarjeta por valorización (nombre, régimen, meses si es Especial, horario, moneda, check de consumibles con margen y filas), botón "Agregar valorización", "Quitar" cuando hay más de una.
- **Pestaña Costeo**: selector de sistema sobre el costeo existente.
- **Pestaña Documento**: checks "Presentación resumida" y "Cuadro resumen final" en la barra; sección IV con un bloque por sistema (detallado o resumido), consumibles bajo su sistema y el resumen al final.
- **Exportación**: HTML, DOCX y PDF muestran lo mismo que la pantalla.

## Diseño visual: "C1 · Marino institucional"

Elegido por el usuario el 2026-11-09 entre seis alternativas. Maqueta de referencia: sección C1 de `docs/superpowers/mockups/2026-11-09-mtc-estilo-c-sobrio.html`. Aplica solo al documento de mantención.

- **Estructura**: columna lateral marina (28 % del ancho) con razón social, título, N° de documento, fecha, cliente, atención, referencia y, al pie, el resumen anual con el total; cuerpo blanco con las secciones del documento.
- **Colores**: marino `#0f2440`; filete dorado `#c9a94f`; rótulos sobre marino `#e3cf8f` y `#b9c4d6`; texto `#1c2533`; texto secundario `#4a5568`; bordes `#d6dbe4`; fondo de fila total `#eef1f6`; rótulo de sección `#6b5a22`.
- **Tipografía**: Source Serif 4 (600) en títulos y cifras destacadas; Source Sans 3 en el resto; rótulos en mayúsculas de 10,5 px con espaciado 0,14 em; cifras tabulares.
- **Tablas**: encabezado marino con texto blanco; filas con línea inferior de 1 px; totales en tabla de 300 px alineada a la derecha, con la fila final destacada.
- **Sin**: píldoras de color, tarjetas redondeadas, sombras, amarillo.
- **Resumen de la columna**: siempre visible; el check "Cuadro resumen final" controla solo el cuadro detallado del cuerpo.
- **DOCX** (supuesto S9): Word no reproduce una columna de color de alto completo entre páginas, así que el DOCX usa una banda superior marina con los mismos datos y los mismos colores de tabla, con Georgia y Calibri.
- **Supuesto S10**: el diseño nuevo no se aplica a las cotizaciones de proyecto.

## Fuera de alcance

- El total del listado, `total_con_iva` y la facturación siguen calculándose solo con el Sistema 1. Sumar los demás sistemas a la facturación es un cambio aparte.
- Reportes SQL sobre el costeo de los sistemas 2 en adelante.
- Cotizaciones de proyecto (`kind='project'`): sin cambios.
