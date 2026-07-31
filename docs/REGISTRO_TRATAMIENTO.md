# Registro de actividades de tratamiento — BravoCRM

**Estado: borrador técnico, sin revisión legal.** Este documento es el
registro operativo (qué se guarda y por qué, desde el código) — no reemplaza
una revisión de un abogado especializado en protección de datos, que sigue
siendo necesaria antes de publicar una política de privacidad real.

Ver también `docs/CLASIFICACION_DATOS.md` (el detalle campo por campo).

## Por qué existe este documento ahora

Chile tiene la Ley 19.628 vigente y la **Ley 21.719** entra en vigor en
diciembre de 2026, con una agencia de protección de datos con potestad
sancionatoria. El sistema guarda RUT y datos de contacto de clientes — eso ya
es tratamiento de datos personales bajo la ley actual, y va a estar bajo
supervisión activa pronto.

## Actividades de tratamiento

| Actividad                             | Datos                                                   | Finalidad                                                   | Base de licitud                        | Destinatarios                                                          |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Gestión de cotizaciones/facturas      | Nombre, RUT, email, teléfono del contacto del cliente   | Ejecutar el contrato comercial (cotizar, facturar)          | Ejecución de contrato                  | Ninguno externo (uso interno)                                          |
| Autenticación de usuarios del sistema | Nombre, email del empleado                              | Dar acceso al sistema, trazabilidad de quién hizo qué       | Relación laboral/contractual           | Ninguno                                                                |
| Recuperación de contraseña            | Email del usuario                                       | Permitir recuperar acceso sin intervención manual del admin | Interés legítimo (seguridad operativa) | Proveedor de correo (Resend, si se activa — ver `docs/EMAIL_SETUP.md`) |
| Registro de sesiones (`sessions`)     | IP, user-agent                                          | Detectar reuso de tokens robados, permitir revocar sesiones | Interés legítimo (seguridad)           | Ninguno                                                                |
| Logging de aplicación                 | Emails enmascarados (`n***@dominio.cl`), IDs de usuario | Diagnóstico de incidentes                                   | Interés legítimo                       | Vercel (hosting de logs), Sentry si se activa                          |

## Encargados de tratamiento

Ver la tabla completa en `docs/CLASIFICACION_DATOS.md#encargados-de-tratamiento`.
**Pendiente:** conseguir y archivar el DPA (Data Processing Agreement) formal
de cada uno — Vercel y Neon lo publican en sus sitios; falta descargarlo y
guardarlo, y confirmar la cláusula de transferencia internacional (todos son
proveedores fuera de Chile).

## Derechos ARCO+ (acceso, rectificación, cancelación, oposición)

**No implementado como proceso operativo.** Hoy, si un titular de datos
pidiera acceso o eliminación de sus datos, la única vía es una intervención
manual directa en la base de datos por el administrador. No hay:

- Un correo o formulario de contacto para recibir la solicitud.
- Un plazo de respuesta comprometido.
- Un procedimiento escrito de qué hacer cuando llega una.

## Borrado real (a diferencia del soft-delete actual)

El sistema hoy solo hace **soft-delete** (`deleted_at`): el registro sigue
existiendo indefinidamente. Esto es **incompatible con el derecho de
supresión** — no hay forma de cumplir "borra mis datos" de verdad.

**No implementado.** Lo que hace falta, en orden:

1. Una función de anonimización para `client_contacts` (pone `name`, `email`,
   `phone`, `cargo` en `NULL` o en un valor tipo `[eliminado]`, conservando la
   fila para no romper las referencias de `quotations`/`invoices` que la
   apuntan — la obligación tributaria de conservar el documento comercial por
   7 años pesa más que el borrado total del contacto).
2. Un endpoint o proceso administrativo protegido por rol `admin` que la
   ejecute.
3. Registrar cuándo y quién ejecutó cada anonimización (auditoría del propio
   borrado).

## Minimización de datos

Revisión rápida: los campos que se piden (`name`, `rut`, `email`, `phone`,
`cargo`, `address`, `city`) son razonables para el propósito (contactar y
facturar a un cliente comercial). No se detectó recolección de datos que no
se use para nada — no hay un hallazgo de "sobre-recolección" que reportar
todavía.

## Notificación de brechas

Referenciado en `docs/DR_RUNBOOK.md` (escenario "Compromiso de credenciales")
pero sin el procedimiento específico de notificación (a quién, en qué plazo,
qué se les dice a los titulares afectados). Pendiente.

## Análisis de brecha frente a la Ley 21.719

**No realizado.** Esto requiere criterio legal, no solo técnico — el ítem más
importante de este documento es justamente que alguien con esa competencia lo
revise antes de la entrada en vigencia (diciembre de 2026). Lo que este
documento aporta es el insumo técnico: qué se guarda, dónde, con qué
proveedores, y qué tan lejos está el sistema de poder cumplir un borrado real
hoy.

## Checklist de lo que falta (priorizado)

1. Revisión legal de este documento y de si el registro de tratamiento actual
   es correcto.
2. Redactar y publicar política de privacidad + T&C reales (con esa revisión
   legal), enlazados desde el login y el pie de página.
3. Implementar el borrado/anonimización real (`client_contacts`).
4. Definir el proceso ARCO+ (aunque sea "escribir a este correo").
5. Archivar los DPA de cada proveedor.
6. Hacer el análisis de brecha Ley 21.719 con fecha límite antes de diciembre
   de 2026.
