# Plan: estilo "Precio unitario agrupado" + tarjeta "Contexto del trabajo"

Rama: `claude/quote-format-styles-189f93`. Estado: borrador con QA de GPT integrado (2026-11-23). Sin implementar.

## Decisiones tomadas

- Ambos features aplican a cotizaciones normales y mantenciones.
- Estilo: solo vista previa + PDF (Word y HTML descargable quedan igual).
- Contexto: botón manual "Analizar contexto", few-shot con 3-5 casos parecidos, se guarda diferencia proyectado vs final + nota corta, magnitudes numéricas, sin PII.
- Jerarquía: mantención = sistema es Ítem y sus equipos son subitems; cotización normal = toda la cotización es un Ítem y sus líneas son subitems.
- Redondeo: Precio Unit. = round(venta del ítem / Cant.); Total = Cant × Unit; Neto = suma de totales; IVA = round(19% neto). El documento puede diferir unos pesos del motor; se muestra un aviso solo en pantalla (no en el PDF).
- El estilo se guarda con la cotización (columna nullable `doc_style`, default null = estilo actual). No toca datos existentes ni el motor.

## Feature A: estilo agrupado (frontend, sin backend de cálculo)

1. `frontend/src/utils/groupedUnitPrice.ts`: función pura `buildGroupedRows(q)` + `roundIva`. Reglas: cantidades 0/vacías se omiten del subitem; unidades distintas se listan sin sumar la unidad en Cant. (se suma solo el número); ítem vacío no se muestra.
2. Componente de vista previa `GroupedValuation` usado por `TabCotizacion` (`Quotations.tsx`) y `TabDocumentoMtc` (`Maintenance.tsx`), con selector en la barra. PDF sale igual (captura del DOM); cuidar cortes de página (`break-inside: avoid` por ítem, encabezado de tabla repetido) en `styles/Quotations.css`.
3. Persistencia de `doc_style`: migración aditiva, zod, INSERT/UPDATE/duplicar con el patrón de `mtc_config` (se escribe solo si la clave viene).
4. Tests (vitest): matriz de agrupación (vacíos, cant. 0, decimales, unidades mixtas, varios sistemas), cuadre Neto/IVA/Total, snapshot de la vista previa.

## Feature B: Contexto del trabajo

1. Migración aditiva: `quotations.work_context JSONB NULL` + tabla `work_context_examples` (contexto saneado, recursos proyectados, recursos finales, diferencia, nota, kind, created_at). Sin `tenant_id` hoy; dejar columna `company_id` nullable preparada solo si se decide en el rumbo multi-empresa. No usar `migrate:down` (BD compartida con el bot).
2. Contrato: `work_context` se acepta parcial en PUT, se copia al duplicar, respeta la versión optimista (409). Clientes antiguos que no envían la clave no lo borran.
3. Endpoint `POST /api/quotations/:id/work-context/analyze` con auth y rol, límite de uso, tope de tamaño de entrada y salida, validación zod estricta de la respuesta de Gemini y ejemplos tratados como datos (no instrucciones). Reusa `callLlm` / `parseLlmJson` de `backend/src/services/llm.ts`.
4. PII: se envía solo tipo, alcance, magnitudes, días y supuestos, pasados por `scrubPii()` (`services/chatbotOps.ts`); nunca RUT, correo, teléfono ni contacto. Aviso visible bajo el campo de texto libre de que no escriba datos personales.
5. Si Gemini falla: la cotización se guarda igual y la tarjeta muestra el aviso (502/503 ya mapeados).
6. Aprendizaje: al guardar recursos finales se inserta el ejemplo; al analizar se buscan 3-5 similares (mismo tipo de trabajo + cercanía de magnitudes) y van como few-shot.
7. UI: tarjeta bajo "Guardar encabezado" en `TabBase` (`Quotations.tsx:1440`) y `TabBaseMtc` (`Maintenance.tsx:419`).
8. Tests: INSERT/UPDATE parcial/duplicar/409, timeout y respuesta malformada de Gemini, exclusión de PII, aislamiento de ejemplos.

## Reparto de delegación

| Pieza                                                                         | Quién               |
| ----------------------------------------------------------------------------- | ------------------- |
| Migraciones, endpoint, esquemas, lógica de ejemplos (backend, delicado)       | Claude Opus 5.5     |
| Utilidad de agrupación, componente, selector, CSS, tests frontend             | Claude Sonnet 5.5   |
| Redacción del prompt de proyección, casos de prueba de borde, revisión de PII | `/asistente-gemini` |
| QA final del diff (segunda opinión, solo lectura)                             | `/asistente-gpt`    |

## Orden

A1 → A2 → A3 → A4, luego B1 → B2 → B3-B6 → B7 → B8, QA final, PR.

## Verificación

`npm test` y `npm run lint` en `backend/` y `frontend/`, `npm run build`, prueba manual en dev con una cotización y una mantención (estilo en vista previa y PDF, cuadre de totales), y simulación de fallo de Gemini. Después de cambiar código: `graphify update .`.
