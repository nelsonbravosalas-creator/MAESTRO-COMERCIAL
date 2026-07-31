# Clasificación de datos personales — BravoCRM

**Estado:** primer borrador técnico. Sirve de insumo para `A-20`
(registro de tratamiento) y para decidir qué cifrar/enmascarar.

| Dato                                     | Tabla.columna                        | Categoría                                   | Base de licitud (borrador)                              | Retención propuesta                                        |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Nombre de contacto                       | `client_contacts.name`               | Identificativo                              | Ejecución de contrato comercial                         | Mientras dure la relación + 7 años (obligación tributaria) |
| Email de contacto                        | `client_contacts.email`              | Identificativo / contacto                   | Ejecución de contrato comercial                         | Igual que arriba                                           |
| Teléfono de contacto                     | `client_contacts.phone`              | Identificativo / contacto                   | Ejecución de contrato comercial                         | Igual que arriba                                           |
| Cargo                                    | `client_contacts.cargo`              | Profesional                                 | Ejecución de contrato comercial                         | Igual que arriba                                           |
| RUT del cliente                          | `clients.rut`                        | Identificativo (persona jurídica o natural) | Ejecución de contrato comercial / obligación tributaria | 7 años (Ley tributaria chilena)                            |
| Nombre de usuario del sistema            | `users.name`                         | Identificativo (empleado)                   | Relación laboral / contractual                          | Mientras dure la relación laboral + plazo legal            |
| Email de usuario del sistema             | `users.email`                        | Identificativo (empleado)                   | Relación laboral / contractual                          | Igual que arriba                                           |
| IP y user-agent de sesión                | `sessions.ip_address`, `.user_agent` | Dato técnico/identificativo                 | Interés legítimo (seguridad, detección de fraude)       | 30 días tras expirar (ver `cleanupSessions.ts`, A-02)      |
| Logs de aplicación (emails enmascarados) | Winston / Vercel logs                | Dato técnico                                | Interés legítimo (operación y soporte)                  | Definir política de retención de logs (`A-19`)             |

## Encargados de tratamiento (proveedores externos)

Todos fuera de Chile — pendiente de revisar/archivar su DPA (Data Processing
Agreement) formalmente:

| Proveedor                                        | Rol                                   | Datos que toca                                            |
| ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------- |
| Vercel                                           | Hosting frontend + función serverless | Todo el tráfico en tránsito                               |
| Neon                                             | Base de datos                         | Todos los datos listados arriba, en reposo                |
| Sentry (si se activa `SENTRY_DSN`)               | Error tracking                        | Stack traces, posible PII incidental en payloads de error |
| Resend (si se activa, ver `docs/EMAIL_SETUP.md`) | Envío de correo                       | Email + nombre del destinatario                           |

## Decisión sobre `pgcrypto` para el RUT (AC-5.8)

**Postergado, no implementado.** El `rut` se usa activamente para búsqueda
exacta (`clients.rut` con índice único) y para el checksum de validación en
`quotations.ts` (`isValidRut`). Cifrarlo a nivel de columna con `pgcrypto`
requeriría descifrar en cada búsqueda/comparación, perdiendo el índice y
degradando esas consultas — sin una necesidad de negocio clara que lo
justifique todavía (el RUT de una empresa/cliente no es tan sensible como el
RUT de una persona natural, y el principal control de acceso ya es que la API
completa requiere autenticación).

**Revisar de nuevo si:** el sistema empieza a manejar RUT de personas
naturales en volumen, o si `A-20` (análisis de brecha Ley 21.719) concluye que
es necesario.

## Qué falta para que esto sea un registro de tratamiento completo

Este documento es la clasificación técnica. `A-20` (`docs/REGISTRO_TRATAMIENTO.md`)
lo convierte en el registro formal con finalidad de cada tratamiento,
destinatarios, y las bases de licitud confirmadas — idealmente con revisión
legal, no solo técnica.
