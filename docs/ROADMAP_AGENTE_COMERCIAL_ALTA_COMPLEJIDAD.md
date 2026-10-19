# Memoria de Arquitectura y Roadmap de Alta Complejidad — Agente Comercial HVAC

> Documento sincronizado con `claude.mem` (`.claude/projects/.../memory/project_agent_openjarvis_and_roadmap.md`) y el grafo de conocimiento `graphify`.

## 1. Hitos Implementados en Producción (Octubre 2026)

1. **Modelo Híbrido OpenJarvis (Commit `f4b1ce1`):**
   - **Fase 1:** Enrutamiento _Local-First_ (`LOCAL_FIRST_BASE_URL` / `OLLAMA_BASE_URL` con fallback a Gemini) y telemetría de costos (`estimatedCostUsd`, `latencyMs`) en `backend/src/services/llm.ts`.
   - **Fase 2:** Trazas de aprendizaje (`chatbot_learning_traces`, migración `0024`) en `backend/src/services/learningTraces.ts` y batería de evaluación `backend/src/agent/__tests__/goldenSet.test.ts`.
   - **Fase 3:** Briefing matutino proactivo (`POST /api/chatbot/briefing/morning` en `backend/src/services/scheduledOps.ts`) y herramienta `consultar_historial_cliente` (`backend/src/agent/tools/historyTool.ts`).

2. **Capacidades Agénticas Opciones A, B y C + Salud de CI (Commit `9cf3506`):**
   - **Fase 0:** Reducción de warnings ESLint en backend a `333` (`<= 343` límite CI).
   - **Opción C (Cubicador de EE.TT. HVAC):** `backend/src/services/hvacTemplates.ts` y `backend/src/agent/tools/specCubicatorTool.ts` (`cubicar_especificacion_hvac` con 5 plantillas de actividad, 3 tramos logísticos por Km, 13 exclusiones y perfiles de margen `estandar` vs `competitivo`).
   - **Opción A (Ingesta de Correo con Frontera PII `A-21`):** `backend/src/agent/tools/emailIntakeTool.ts` (`sanitizeEmailPii` y `procesar_correo_cotizacion`).
   - **Opción B (Inteligencia Win/Loss & Seguimiento Human-in-the-Loop):** `backend/src/agent/tools/followUpTool.ts` (`analizar_win_loss_cliente` y `preparar_seguimiento_cotizacion`).
   - **UI:** Chips de acción rápida en `frontend/src/components/ChatPanel.tsx`.

---

## 2. Capacidades de Autonomía Comercial (Ciclo Quote-to-Cash)

1. **Radar de Cobranza, Flujo de Caja y Riesgo Crediticio (`invoices.ts`):**
   - `consultar_estado_cobranza`: Facturas vencidas, por vencer y cedidas a factoring.
   - `evaluar_riesgo_comercial_cliente`: Guardarraíl previo a cotizar con pago a 30 días si el cliente registra mora activa.
   - `preparar_gestion_cobranza`: Borrador de seguimiento de pago con registro en `invoice_followups`.
2. **Cierre Comercial, Registro de OC y Traspaso a Proyecto (`quotations.ts` + `projects.ts`):**
   - `registrar_resultado_cotizacion`: Adjudicación con datos de OC (dispara creación de proyecto) o pérdida con `loss_reason` / `loss_competitor`.
   - `consultar_estado_proyectos`: Consulta de avance operativo de obras adjudicadas.
3. **Simulador de Negociación y Guardarraíl de Descuentos:**
   - `simular_negociacion_cotizacion` y `aplicar_ajuste_margen_cotizacion` sobre `v_quotation_totals`.
4. **Motor de Recurrencia y Upselling a Contratos de Mantención (`Maintenance.tsx`):**
   - `detectar_oportunidades_mantencion`: Detecta clientes con múltiples servicios correctivos para proponer contratos `kind = 'maintenance'`.
5. **Autogobierno de Catálogo desde Precios Web:**
   - `proponer_actualizacion_catalogo`: Persiste en `catalog_items` / `electrical_catalog_items` precios validados en mercado.

---

## 3. Motores de Alta Complejidad Técnica (Deep Engineering Roadmap)

|   #   | Motor / Herramienta                                                      | Núcleo Algorítmico / Físico                                                                                                                                                                                                                                    | Módulos Conectados                                                               |
| :---: | :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **1** | **Motor Multimodal de Licitaciones, Planos CAD/PDF y Física HVAC**       | Visión Computacional (`VLM`) sobre planos/unifilares + Cálculo termodinámico determinista (diámetros cobre, carga R-410A/R-32 por metro, caída de tensión $\Delta V < 3\%$) + Auditoría de multas/garantías y Curva S de caja + Orquestación paralela bajo 40s | `quotations.ts`, `catalog.ts`, `electrical-catalog.ts`, `invoices.ts`, `loop.ts` |
| **2** | **Optimizador Combinatorio de Cuadrillas y Ruteo Multi-Faena (`VRPTW`)** | Investigación de Operaciones (_Skill-Constrained VRPTW & RCPSP_) para consolidar visitas en ruta (_Route Bundling_) y reducir logística (`log`) hasta 40%                                                                                                      | `projects.ts`, `Maintenance.tsx`, `cityDistances`                                |
| **3** | **Gemelo Digital de Rentabilidad de Obra (`Closed-Loop EVM`)**           | _Earned Value Management_ (`CPI`/`SPI`) + Simulación de Monte Carlo para detectar erosión de margen en obra y auto-calibrar `hvacTemplates.ts`                                                                                                                 | `quotations.ts`, `projects.ts`, `hvacTemplates.ts`                               |
| **4** | **Simulador de Tesorería, Mora Empírica y Factoring (`VAN/TIR`)**        | Cálculo de _DSO real_ por cliente, recargo financiero en cotizaciones y optimización tipo _Knapsack_ de facturas a factorizar                                                                                                                                  | `invoices.ts`, `quotations.ts`                                                   |
| **5** | **Diagnóstico Forense Termodinámico y TCO Energético (`FMEA`)**          | Árboles de Falla (`FTA`) por sobrecalentamiento/subenfriamiento/acidez + Simulación financiera `CapEx vs OpEx` (`EER`/`COP` vs tarifa kWh)                                                                                                                     | `hvacTemplates.ts`, `catalog.ts`                                                 |
| **6** | **Arbitraje Multi-Proveedor y Cobertura Cambiaria (`USD/UF/Cobre`)**     | Homologación difusa de SKUs equivalentes entre marcas (_Value Engineering_) + modelo de sensibilidad cambiaria                                                                                                                                                 | `priceTool.ts`, `catalog.ts`                                                     |
| **7** | **Inteligencia Contrafactual Multi-Salto (`Graph-RAG Bayesiano`)**       | Recorrido multi-salto e inferencia bayesiana sobre `chatbot_graph_nodes` y `chatbot_graph_edges`                                                                                                                                                               | `chatbotGraph.ts`, `historyTool.ts`                                              |
