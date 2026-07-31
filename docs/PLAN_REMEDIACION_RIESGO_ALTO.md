# Plan de Remediación — Hallazgos de Riesgo Alto

**Proyecto:** MAESTRO-COMERCIAL / BravoCRM
**Base:** Auditoría QA `docs/AUDITORIA_QA_2026-07.html`, sección **5. Riesgo alto** (commit `fbff2c8`, rama `master`)
**Alcance:** los 20 hallazgos clasificados como **ALTO**. Excluye el ítem de Pagos.
**Prerrequisito:** `docs/PLAN_REMEDIACION_CRITICOS.md` (C-01…C-12) completado o en curso.
**Rol:** Ingeniero Senior Full Stack
**Duración estimada:** 16–18 días/persona repartidos en 5 sprints

---

## 0. Cómo usar este documento

Mismo formato que el plan de críticos. Cada hallazgo (`A-01` … `A-20`) contiene evidencia con archivo:línea, riesgo concreto, solución con código, criterios de aceptación numerados (`AC-x.y`) y el comando exacto de verificación.

**Regla de cierre (idéntica):** ningún hallazgo se cierra sin una prueba automatizada en CI que falle si el problema reaparece.

### Dependencias entre hallazgos

```
C-06 (CI) ────────────────► habilita todos los AC automatizados de este plan
A-03 (correo) ────────────► A-04 (recuperación de contraseña)
A-08 (staging) ───────────► A-09 (CD con gates)
A-11 (paginación) ────────► A-17 (escalabilidad)
A-01 (zod) ───────────────► A-11 (contratos OpenAPI derivados de los esquemas)
C-07 (suite ejecutable) ──► A-12, A-13, A-14, A-15
```

### Orden de ejecución

| Sprint | Tema | Hallazgos | Días |
|---|---|---|---|
| 4 | Seguridad aplicativa | A-01 → A-06 | 4 |
| 5 | Plataforma y proceso | A-07 → A-11 | 4 |
| 6 | Calidad y pruebas | A-12 → A-15 | 4 |
| 7 | Rendimiento y continuidad | A-16 → A-19 | 3 |
| 8 | Cumplimiento | A-20 | 2 |

### Resumen

| ID | Hallazgo | Cumpl. actual | Esfuerzo | Sprint |
|---|---|:--:|:--:|:--:|
| A-01 | Validación de entradas sin esquemas | 35% | 12 h | 4 |
| A-02 | Sesiones no revocables ni rotadas | 35% | 8 h | 4 |
| A-03 | Sin proveedor de correo (SPF/DKIM/DMARC) | 0% | 6 h | 4 |
| A-04 | Sin recuperación ni cambio de contraseña | 5% | 10 h | 4 |
| A-05 | TLS a la base de datos sin validar + datos personales sin cifrar | 25% | 4 h | 4 |
| A-06 | Sin WAF ni protección perimetral | 15% | 4 h | 4 |
| A-07 | Tres entrypoints de servidor divergentes | 65% | 6 h | 5 |
| A-08 | Sin entorno de staging | 35% | 6 h | 5 |
| A-09 | CD sin gates, migraciones ni rollback | 55% | 6 h | 5 |
| A-10 | Control de versiones sin proceso | 40% | 4 h | 5 |
| A-11 | API sin contrato, versionado ni paginación | 55% | 12 h | 5 |
| A-12 | Lint del frontend nunca ejecutado | 30% | 6 h | 6 |
| A-13 | Cobertura de pruebas unitarias insuficiente | 35% | 12 h | 6 |
| A-14 | Sin pruebas contra PostgreSQL real | 25% | 8 h | 6 |
| A-15 | Sin pruebas end-to-end | 0% | 10 h | 6 |
| A-16 | Bundle de 2,1 MB sin code-splitting | 35% | 6 h | 7 |
| A-17 | Antipatrón de conexiones en serverless | 45% | 6 h | 7 |
| A-18 | Sin plan de recuperación ante desastres | 10% | 6 h | 7 |
| A-19 | Sin requerimientos no funcionales ni SLOs | 15% | 4 h | 7 |
| A-20 | Sin privacidad, T&C ni gestión de datos personales | 5% | 12 h | 8 |

---

# SPRINT 4 — Seguridad aplicativa

---

## A-01 · Validación de entradas sin esquemas

> **Riesgo:** ALTO · **Esfuerzo:** 12 h · **Cumplimiento actual:** 35%

### Evidencia

No existe ninguna librería de validación en el proyecto: `grep -rn "zod\|joi\|express-validator" backend/ frontend/ --include=package.json` no devuelve nada. Las validaciones son manuales y desiguales:

| Patrón actual | Ubicación |
|---|---|
| Lista blanca de estados (correcto, pero ad-hoc) | `quotations.ts:6-8` (`VALID_STATUSES`, `VALID_OPER_STATES`) |
| Campo requerido suelto | `invoices.ts:61` (`if (!client_id) return 400`) |
| Desestructuración directa del body sin validar | `projects.ts`, `clients.ts`, `catalog.ts` |
| Sin límite de longitud de strings ni validación numérica | todos los routers |

La única red real son los `CHECK` de PostgreSQL, que producen un `500` genérico en vez de un `400` explicativo.

### Riesgo

Datos corruptos que llegan a la base de datos (cantidades negativas por coerción, strings de megabytes en campos de texto, tipos inesperados), errores `500` donde corresponde `400`, y superficie de ataque innecesaria en el importador de cotizaciones (`quotations.ts:442`), que acepta estructuras anidadas de hasta 10 MB.

### Solución

Adoptar `zod` con un middleware de validación reutilizable. Definir los esquemas en `backend/src/schemas/` y compartir los tipos con el frontend.

```ts
// backend/src/middleware/validate.ts
import { ZodSchema } from 'zod'
import { Request, Response, NextFunction } from 'express'

export const validate = (schema: { body?: ZodSchema; params?: ZodSchema; query?: ZodSchema }) =>
  (req: Request, res: Response, next: NextFunction) => {
    for (const key of ['body', 'params', 'query'] as const) {
      const s = schema[key]
      if (!s) continue
      const result = s.safeParse(req[key])
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation error',
          details: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        })
      }
      req[key] = result.data as never   // usa el valor saneado y tipado
    }
    next()
  }
```

```ts
// backend/src/schemas/quotation.ts
export const quotationCreateSchema = z.object({
  client_id: z.string().uuid(),
  contact_id: z.string().uuid().nullish(),
  status: z.enum(VALID_STATUSES).default('Borrador'),
  iva_pct: z.number().int().min(0).max(100).default(19),
  date: z.coerce.date(),
  line_items: z.array(z.object({
    category_id: z.enum(CATEGORY_IDS),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().nonnegative(),
    days: z.number().int().min(1),
    unit_price: z.number().nonnegative(),
  })).max(500),
})
```

```diff
- router.post('/', async (req: AuthRequest, res) => {
+ router.post('/', validate({ body: quotationCreateSchema }), async (req: AuthRequest, res) => {
```

Los esquemas se reutilizan en `A-11` para generar el contrato OpenAPI, y en `C-01` ya se usa `zod` para validar el entorno: una sola dependencia cubre tres hallazgos.

### Criterios de aceptación

- [ ] **AC-1.1** — Existe `middleware/validate.ts` y `schemas/` con un esquema por operación de escritura.
- [ ] **AC-1.2** — **Todos** los `POST`, `PUT` y `PATCH` del backend pasan por `validate(...)`. Verificable: cada `router.post|put|patch` tiene el middleware.
- [ ] **AC-1.3** — Un body inválido devuelve `400` con `details[]` indicando campo y motivo; nunca `500`.
- [ ] **AC-1.4** — Los campos no declarados en el esquema se descartan (no llegan a la capa de datos).
- [ ] **AC-1.5** — Todo string tiene longitud máxima; todo número tiene rango. No existe campo de texto sin límite.
- [ ] **AC-1.6** — Los `:id` de ruta se validan como UUID: `/api/quotations/abc` devuelve `400`, no `500`.
- [ ] **AC-1.7** — El importador (`POST /api/quotations/import`) valida la estructura completa y rechaza arreglos de más de 500 líneas con `400`.
- [ ] **AC-1.8** — Los tipos de los esquemas (`z.infer`) se usan en los handlers: se elimina el `any` en los bodies.
- [ ] **AC-1.9** — Suite de pruebas de validación: por cada esquema, al menos un caso válido y tres inválidos (tipo incorrecto, fuera de rango, campo faltante).

### Verificación

```bash
curl -s -X POST $API/api/quotations -H "$AUTH" -H 'content-type: application/json' \
  -d '{"client_id":"no-es-uuid","iva_pct":999}' | jq .details    # → 400 con 2 issues
curl -s -o /dev/null -w '%{http_code}\n' $API/api/quotations/abc -H "$AUTH"   # → 400
npm test -- validation
```

---

## A-02 · Sesiones no revocables ni rotadas

> **Riesgo:** ALTO · **Esfuerzo:** 8 h · **Cumplimiento actual:** 35%

### Evidencia

La tabla `sessions` está bien diseñada (`schema.sql:54-67`: `refresh_token`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`, índice `ix_sessions_active`), pero **se escribe y nunca se lee**:

| Punto | Comportamiento actual |
|---|---|
| `auth.ts:115` | `INSERT INTO sessions (...)` — guarda el refresh token **en texto plano** |
| `auth.ts:167` | `POST /refresh` valida **solo la firma** del JWT: no consulta `sessions`, no mira `revoked_at` |
| — | No existe `POST /api/auth/logout` |
| `auth.ts:118-124` | Si el `INSERT` falla, solo se registra un `logger.warn` y el login continúa |
| `frontend/src/api/api.ts:73-75` | El cliente ya soporta rotación (`if (data.refresh_token) …`), pero el backend nunca la envía |

### Riesgo

Un refresh token filtrado es válido **30 días** y **no se puede revocar**: no hay logout, no hay "cerrar todas las sesiones", y despedir a un usuario o desactivar su cuenta no invalida sus tokens vigentes. Además, los refresh tokens están en texto plano en la base de datos: un volcado comprometido entrega sesiones activas directamente.

### Solución

1. **Almacenar solo el hash**: `sha256(refresh_token)` en la columna (renombrar a `refresh_token_hash`).
2. **Validar en `/refresh`** contra la tabla: existe, `revoked_at IS NULL`, `expires_at > NOW()`, usuario activo.
3. **Rotación con detección de reutilización**: cada refresh emite un token nuevo y revoca el anterior. Si llega un token ya revocado, revocar **todas** las sesiones del usuario (señal de robo).
4. **`POST /api/auth/logout`**: marca `revoked_at` de la sesión actual. **`POST /api/auth/logout-all`**: todas las del usuario.
5. **Fallo duro**: si no se puede persistir la sesión, el login devuelve `503` en vez de continuar.
6. Registrar `ip_address` y `user_agent` (columnas ya existentes, hoy sin usar).
7. Limpieza de sesiones expiradas mediante tarea programada.

```ts
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

// POST /refresh
const row = await pool.query(
  `SELECT s.id, s.revoked_at, u.id AS user_id, u.email, u.name, u.role, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.refresh_token_hash = $1 AND s.expires_at > NOW() AND u.deleted_at IS NULL`,
  [hash(refresh_token)]
)
if (row.rowCount === 0) return res.status(401).json({ error: 'Unauthorized' })
if (row.rows[0].revoked_at) {
  await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [row.rows[0].user_id])
  logger.error('Refresh token reuse detected', { userId: row.rows[0].user_id })
  return res.status(401).json({ error: 'Unauthorized' })
}
// … revocar la actual, emitir par nuevo, insertar sesión nueva (en una transacción)
```

### Criterios de aceptación

- [ ] **AC-2.1** — La columna almacena un hash SHA-256; `SELECT refresh_token_hash FROM sessions LIMIT 1` no devuelve un JWT legible.
- [ ] **AC-2.2** — `POST /refresh` con un token cuya sesión fue revocada devuelve `401`, aunque la firma JWT sea válida y no haya expirado.
- [ ] **AC-2.3** — `POST /refresh` devuelve un `refresh_token` **nuevo** y el anterior deja de funcionar (rotación efectiva).
- [ ] **AC-2.4** — Reutilizar un refresh token ya rotado revoca **todas** las sesiones del usuario y deja registro de nivel `error` en el log.
- [ ] **AC-2.5** — `POST /api/auth/logout` devuelve `204` y el refresh token usado deja de servir.
- [ ] **AC-2.6** — `POST /api/auth/logout-all` invalida todas las sesiones; los access tokens vigentes caducan en ≤ 1 h.
- [ ] **AC-2.7** — Desactivar un usuario (`is_active = false`) impide el refresh de inmediato.
- [ ] **AC-2.8** — Si el `INSERT` de sesión falla, el login responde `503` y **no** entrega tokens.
- [ ] **AC-2.9** — Cada sesión registra `ip_address` y `user_agent`.
- [ ] **AC-2.10** — Una tarea programada elimina las sesiones expiradas hace más de 30 días.
- [ ] **AC-2.11** — Pruebas automatizadas cubren AC-2.2, AC-2.3, AC-2.4 y AC-2.5.

### Verificación

```bash
T1=$(login | jq -r .refresh_token)
T2=$(refresh $T1 | jq -r .refresh_token)
refresh $T1   # → 401 (rotado)  y todas las sesiones del usuario quedan revocadas
refresh $T2   # → 401 (revocado por la detección de reutilización)
```

---

## A-03 · Sin proveedor de correo (SPF / DKIM / DMARC)

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 0% · **Bloquea:** A-04

### Evidencia

No existe ninguna dependencia ni código de envío de correo en el repositorio. Como consecuencia directa: no hay recuperación de contraseña, no se pueden enviar cotizaciones al cliente ni facturas por correo, y no hay notificaciones de ningún tipo.

### Riesgo

Además de bloquear `A-04`, enviar correo transaccional **sin** SPF, DKIM y DMARC configurados garantiza que los mensajes lleguen a spam o sean rechazados, y expone el dominio a suplantación (un tercero puede enviar correos que aparenten venir de la empresa).

### Solución

1. Proveedor: **Resend** (integración nativa con Vercel, plan gratuito suficiente) o Amazon SES si se prefiere AWS.
2. Verificar el dominio y publicar los tres registros DNS:

   | Registro | Valor |
   |---|---|
   | SPF (TXT `@`) | `v=spf1 include:<proveedor> ~all` |
   | DKIM (CNAME/TXT) | el par de claves que entrega el proveedor |
   | DMARC (TXT `_dmarc`) | `v=DMARC1; p=quarantine; rua=mailto:dmarc@<dominio>; pct=100` |

   Empezar con `p=none` durante una semana para recolectar reportes, y endurecer a `p=quarantine`.
3. Servicio `backend/src/services/mailer.ts` con plantillas y reintentos; **nunca** bloquear el request principal por un fallo de correo.
4. Registrar cada envío (destinatario, plantilla, id del proveedor, estado) y alertar si la tasa de rebote supera el 5%.

### Criterios de aceptación

- [ ] **AC-3.1** — El dominio está verificado en el proveedor y los tres registros resuelven correctamente en DNS.
- [ ] **AC-3.2** — Un correo enviado a Gmail y a Outlook llega a **bandeja de entrada**, no a spam.
- [ ] **AC-3.3** — El encabezado del correo recibido muestra `spf=pass`, `dkim=pass` y `dmarc=pass`.
- [ ] **AC-3.4** — La política DMARC está en `p=quarantine` como mínimo, con `rua` a un buzón monitoreado.
- [ ] **AC-3.5** — Existe `services/mailer.ts` con interfaz tipada y **una implementación falsa para pruebas** (no se envían correos reales en CI).
- [ ] **AC-3.6** — Un fallo del proveedor no provoca un `500` en el endpoint que originó el envío.
- [ ] **AC-3.7** — La API key del proveedor está en variables de entorno y validada en el esquema de `C-01`.
- [ ] **AC-3.8** — Cada envío queda registrado con su identificador del proveedor.

### Verificación

```bash
dig +short TXT <dominio> | grep spf1
dig +short TXT _dmarc.<dominio>
```
Enviar a `check-auth@verifier.port25.com` y confirmar `pass` en las tres comprobaciones del informe.

---

## A-04 · Sin recuperación ni cambio de contraseña

> **Riesgo:** ALTO · **Esfuerzo:** 10 h · **Cumplimiento actual:** 5% · **Depende de:** A-03

### Evidencia

No existe flujo de olvido de contraseña, ni cambio autogestionado, ni endpoint de gestión de usuarios. La única vía de recuperación es `POST /api/admin/setup` con `ADMIN_SETUP_SECRET` (`admin.ts:20`), es decir: **intervención manual del administrador con un secreto de infraestructura**.

### Riesgo

Un usuario que olvida su PIN queda bloqueado hasta que alguien con acceso al panel de Vercel intervenga. Eso empuja a mantener `ADMIN_SETUP_SECRET` permanentemente activo (endpoint sin JWT expuesto a Internet) y a compartir credenciales entre personas, lo que anula la trazabilidad de `created_by`.

### Solución

Tres endpoints y una tabla:

```sql
CREATE TABLE password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_pwreset_user ON password_resets (user_id) WHERE used_at IS NULL;
```

| Endpoint | Comportamiento |
|---|---|
| `POST /api/auth/forgot-password` | Genera token aleatorio de 32 bytes, guarda su hash con expiración de 15 min, envía el correo. **Responde siempre `202`**, exista o no el correo (evita enumeración de usuarios). Con rate limit de 3/hora por email. |
| `POST /api/auth/reset-password` | Valida token (existe, no usado, no expirado), aplica la política de contraseña, actualiza el hash, marca `used_at`, **revoca todas las sesiones** (`A-02`) y notifica por correo. |
| `POST /api/auth/change-password` | Autenticado. Exige la contraseña actual, aplica la política, revoca las **demás** sesiones. |

Política de contraseña: mínimo 8 caracteres, no puede ser solo dígitos, contrastada contra una lista de las más comunes. Esto reemplaza definitivamente el PIN de 4 dígitos.

### Criterios de aceptación

- [ ] **AC-4.1** — `POST /forgot-password` responde `202` tanto para un correo existente como inexistente, **con el mismo tiempo de respuesta** (sin canal lateral de enumeración).
- [ ] **AC-4.2** — El correo llega con un enlace válido; el token **no** se almacena en claro en la base de datos.
- [ ] **AC-4.3** — El token expira a los 15 minutos y es de **un solo uso**: el segundo intento devuelve `400`.
- [ ] **AC-4.4** — Solicitar un nuevo token invalida los anteriores del mismo usuario.
- [ ] **AC-4.5** — Tras el reset, **todas** las sesiones previas quedan revocadas y el usuario recibe un correo de aviso.
- [ ] **AC-4.6** — `POST /change-password` con contraseña actual incorrecta devuelve `401` y no modifica nada.
- [ ] **AC-4.7** — La política rechaza contraseñas de menos de 8 caracteres, solo numéricas o presentes en la lista de comunes, con mensaje explicativo.
- [ ] **AC-4.8** — Rate limit: la 4.ª solicitud de reset en una hora para el mismo correo devuelve `429`.
- [ ] **AC-4.9** — Con el flujo operativo, `ADMIN_SETUP_SECRET` se retira del entorno de producción y `/api/admin/setup` responde `503`.
- [ ] **AC-4.10** — Pruebas automatizadas cubren AC-4.1, AC-4.3, AC-4.5 y AC-4.7.

### Verificación

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST $API/api/auth/forgot-password -d '{"email":"existe@x.cl"}'
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -X POST $API/api/auth/forgot-password -d '{"email":"noexiste@x.cl"}'
# → ambos 202, tiempos equivalentes
```

---

## A-05 · TLS a la base de datos sin validar y datos personales sin cifrar

> **Riesgo:** ALTO · **Esfuerzo:** 4 h · **Cumplimiento actual:** 25%

### Evidencia

`backend/src/app.ts:19-24`:

```ts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },      // ← no valida el certificado del servidor
  max: 5,
})
```

`backend/src/server.ts:23-26` usa otra configuración (`ssl` desactivado fuera de producción), reforzando el drift de `A-07`.

La base almacena datos personales sin ninguna protección adicional: `clients.rut`, `client_contacts.email`, `.telefono`, `.name`, `.cargo`.

### Riesgo

`rejectUnauthorized: false` acepta **cualquier** certificado: la conexión se cifra pero no se autentica, habilitando un man-in-the-middle sobre el tráfico hacia Neon (que incluye credenciales y todos los datos de negocio). Es un patrón copiado de tutoriales que anula buena parte del valor de TLS.

### Solución

```ts
ssl: {
  rejectUnauthorized: true,
  ca: env.DATABASE_CA_CERT,     // CA de Neon, o usar sslmode=verify-full en la URL
}
```

Alternativa preferida (resuelve también `A-17`): usar el driver `@neondatabase/serverless`, **ya declarado como dependencia y hoy sin utilizar**, que gestiona TLS correctamente sobre HTTPS.

Para datos personales:
1. Clasificar los campos en `docs/CLASIFICACION_DATOS.md` (insumo obligatorio de `A-20`).
2. Confirmar y documentar el cifrado en reposo de Neon.
3. Evaluar `pgcrypto` para el `rut`, midiendo el impacto en las búsquedas.
4. Redactar PII en los logs (`A-19` / `C-08`): hoy `logger.info('User login successful', { email })` escribe correos en claro.

### Criterios de aceptación

- [ ] **AC-5.1** — `grep -rn "rejectUnauthorized: false" backend/ api/` devuelve **0 coincidencias**.
- [ ] **AC-5.2** — La aplicación conecta correctamente con validación de certificado activa.
- [ ] **AC-5.3** — Una conexión con certificado inválido **falla** (probado contra un endpoint con certificado autofirmado).
- [ ] **AC-5.4** — `app.ts` y `server.ts` comparten exactamente la misma configuración de pool (consecuencia de `A-07`).
- [ ] **AC-5.5** — Existe `docs/CLASIFICACION_DATOS.md` con los campos personales, su base de licitud y su periodo de retención.
- [ ] **AC-5.6** — El cifrado en reposo del proveedor está confirmado y documentado.
- [ ] **AC-5.7** — Ningún log contiene correos, RUT ni teléfonos completos (se enmascaran: `n***@gmail.com`).
- [ ] **AC-5.8** — La decisión sobre `pgcrypto` está documentada (implementada o justificada su postergación).

### Verificación

```bash
grep -rn "rejectUnauthorized" backend/ api/
psql "$DATABASE_URL&sslmode=verify-full" -c 'select 1'    # debe conectar
npm test -- logging-redaction                             # AC-5.7
```

---

## A-06 · Sin WAF ni protección perimetral

> **Riesgo:** ALTO · **Esfuerzo:** 4 h · **Cumplimiento actual:** 15%

### Evidencia

No hay WAF, ni protección contra bots, ni restricción de acceso a Neon por IP o proyecto. La única protección es la de la plataforma por defecto. El rate limiting a nivel de aplicación se introduce en `C-04`, pero opera **después** de que la petición consumió una invocación serverless.

### Riesgo

Un ataque volumétrico contra `/api/auth/login` consume invocaciones (coste directo, ver el hallazgo de costos) antes de que el limitador de aplicación actúe. Sin restricción de red, la base de datos es alcanzable desde cualquier origen que tenga la cadena de conexión.

### Solución

1. **Vercel Firewall / WAF**: reglas de rate limit por ruta en el borde para `/api/auth/*` y `/api/admin/*`, y `challenge` para tráfico automatizado.
2. **Neon**: activar IP allowlist / acceso restringido al proyecto y **rotar la cadena de conexión** tras el cambio.
3. Bloqueo geográfico si la operación es exclusivamente nacional (decisión de negocio).
4. Alertas de picos anómalos de tráfico integradas con la observabilidad de `C-08`.

### Criterios de aceptación

- [ ] **AC-6.1** — Existe una regla de WAF con rate limit en el borde para `/api/auth/login`, verificada con una prueba controlada.
- [ ] **AC-6.2** — El bloqueo ocurre **antes** de invocar la función (visible como bloqueo en el panel, no como invocación).
- [ ] **AC-6.3** — El acceso a Neon está restringido y una conexión desde una IP no autorizada falla.
- [ ] **AC-6.4** — La cadena de conexión fue rotada después de aplicar la restricción.
- [ ] **AC-6.5** — Existe alerta ante un pico de tráfico anómalo (> 10× la línea base horaria).
- [ ] **AC-6.6** — Las reglas están documentadas en `docs/INFRA.md`, incluido el procedimiento de excepción.
- [ ] **AC-6.7** — El tráfico legítimo no se degrada: los flujos principales funcionan con normalidad tras activar las reglas.

### Verificación

Ejecutar 200 peticiones en 10 s contra `/api/auth/login` desde una IP de prueba; confirmar `429`/`403` desde el borde en el panel y **ninguna** invocación de función asociada.

---

# SPRINT 5 — Plataforma y proceso

---

## A-07 · Tres entrypoints de servidor divergentes

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 65%

### Evidencia

| Archivo | Líneas | Rol | Divergencia |
|---|---|---|---|
| `backend/src/app.ts` | 60 | El que **usa producción** (vía `api/index.ts`) | CORS abierto, monta `/api/admin`, `ssl.rejectUnauthorized:false` |
| `backend/src/server.ts` | 114 | `npm run dev` | CORS con `FRONTEND_URL`, **no monta `/api/admin`**, ssl condicional, tiene logging de peticiones que `app.ts` no tiene |
| `backend/src/server-dev.ts` | 982 | `npm run dev:json` | Backend paralelo completo sobre `db.json`, con su propia lógica de negocio |
| `api/index.ts` | 144 | Handler de Vercel | Incluye un **cuarto** backend: el fallback con usuarios hardcodeados (se elimina en `C-05`) |

### Riesgo

"Funciona en local" no dice nada sobre producción: se ejecuta código distinto. Cada corrección debe replicarse en hasta cuatro lugares y, en la práctica, no se replica — de ahí que `app.ts` carezca del logging de peticiones que `server.ts` sí tiene. Las 982 líneas de `server-dev.ts` son una segunda implementación de las reglas de negocio que nadie mantiene sincronizada.

### Solución

```
app.ts        → única definición de la aplicación (middlewares, routers, errores)
server.ts     → import app from './app'; app.listen(env.PORT)   [≈ 10 líneas]
api/index.ts  → import app from '../backend/src/app'; export default app  [≈ 5 líneas]
server-dev.ts → eliminado, o movido a legacy/ y excluido del build
```

Para desarrollo local sin nube, el sustituto correcto de `server-dev.ts` es el `docker-compose.yml` que ya existe, con `npm run migrate:up` y `npm run seed`.

Documentar la arquitectura resultante y registrar la decisión en `docs/adr/0001-entrypoint-unico.md`.

### Criterios de aceptación

- [ ] **AC-7.1** — `server.ts` tiene menos de 20 líneas y no define middlewares ni routers propios.
- [ ] **AC-7.2** — `api/index.ts` reexporta `app` sin lógica de negocio ni usuarios hardcodeados.
- [ ] **AC-7.3** — `server-dev.ts` fue eliminado o excluido de `tsconfig`/build, y el script `dev:json` retirado de `package.json`.
- [ ] **AC-7.4** — Un middleware añadido en `app.ts` (por ejemplo, `x-request-id`) aparece en **todos** los modos de ejecución.
- [ ] **AC-7.5** — Los routers montados en local y en producción son idénticos, incluido `/api/admin`.
- [ ] **AC-7.6** — El desarrollo local funciona con `docker compose up` + `migrate:up` + `seed`, documentado en un `SETUP_LOCAL.md` actualizado.
- [ ] **AC-7.7** — Existe `docs/adr/0001-entrypoint-unico.md` con contexto, decisión y consecuencias.
- [ ] **AC-7.8** — Sin regresiones: la suite completa pasa y los flujos principales funcionan en local y en preview.

### Verificación

```bash
wc -l backend/src/server.ts api/index.ts     # AC-7.1, AC-7.2
diff <(grep -o "'/api/[a-z]*'" backend/src/app.ts | sort) \
     <(grep -o "'/api/[a-z]*'" backend/src/server.ts | sort)   # AC-7.5
```

---

## A-08 · Sin entorno de staging

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 35% · **Bloquea:** A-09

### Evidencia

Solo existen desarrollo y producción. Todo cambio fusionado en `master` llega directo a usuarios reales. No hay base de datos intermedia donde probar migraciones (`C-11`) ni validar el comportamiento con datos realistas.

### Riesgo

Las migraciones se estrenan en producción. Cualquier cambio de esquema o de configuración se valida sobre datos reales, sin posibilidad de ensayo ni de rollback probado.

### Solución

1. **Branch de Neon** para staging (copia por copy-on-write de producción, coste marginal), con datos **anonimizados**.
2. Proyecto/entorno `staging` en Vercel apuntando a ese branch, desplegado desde la rama `develop` o desde cada PR (preview).
3. Variables de entorno propias por entorno: secretos distintos, `ALLOWED_ORIGINS` distinto, Sentry con `environment: staging`.
4. Script `npm run anonymize` que enmascare nombres, correos, RUT y teléfonos al refrescar staging.
5. Regla: **ninguna migración llega a producción sin haberse aplicado antes en staging**.

### Criterios de aceptación

- [ ] **AC-8.1** — Existe una URL de staging accesible y funcional, con su propia base de datos.
- [ ] **AC-8.2** — Staging **no** comparte secretos con producción (JWT, base de datos, API keys son distintos).
- [ ] **AC-8.3** — Los datos de staging están anonimizados: ningún correo, RUT ni teléfono real.
- [ ] **AC-8.4** — Existe `npm run anonymize`, idempotente y documentado.
- [ ] **AC-8.5** — Cada PR genera un preview funcional conectado a staging.
- [ ] **AC-8.6** — Las migraciones se aplican automáticamente en staging antes que en producción.
- [ ] **AC-8.7** — Sentry y los logs distinguen `environment` (los errores de staging no contaminan las alertas de producción).
- [ ] **AC-8.8** — El flujo de promoción está documentado: `feature → PR (preview) → develop (staging) → master (producción)`.

### Verificación

Desplegar un cambio visible únicamente en staging; confirmar que la URL de producción no lo refleja y que la base de datos de staging no contiene correos reales:

```sql
SELECT count(*) FROM client_contacts WHERE email NOT LIKE '%@example.test';  -- → 0
```

---

## A-09 · CD sin gates, migraciones ni rollback

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 55% · **Depende de:** A-08, C-06, C-11

### Evidencia

`vercel.json` define `buildCommand` y `rewrites`, y el deploy se dispara con cada push a `master`. No hay ejecución de migraciones, ni smoke test posterior, ni procedimiento de rollback documentado, ni gate de calidad previo.

### Riesgo

Un commit roto llega a producción en minutos y **no existe un procedimiento escrito para revertirlo**. Si además incluye una migración, el rollback del código deja el esquema adelantado, con fallos en runtime difíciles de diagnosticar bajo presión.

### Solución

Pipeline de promoción:

```yaml
deploy-production:
  needs: [quality, secrets, integration]      # gates de C-06
  if: github.ref == 'refs/heads/master'
  steps:
    - run: npm run migrate:up                  # C-11, contra producción
    - run: vercel deploy --prod --token=$VERCEL_TOKEN
    - run: ./scripts/smoke.sh $PROD_URL        # falla → rollback automático
```

`scripts/smoke.sh` verifica, como mínimo: `/api/health` responde `200` con `db: ok`, el login de un usuario de prueba devuelve `200`, y el frontend sirve el `index.html` con los assets correctos.

Rollback: `vercel rollback` para el código; para el esquema, la regla de compatibilidad hacia atrás de `C-11` (expand → migrate → contract) garantiza que la versión anterior siga funcionando con el esquema nuevo.

Documentar todo en `docs/DESPLIEGUE.md` con el procedimiento de emergencia paso a paso.

### Criterios de aceptación

- [ ] **AC-9.1** — El deploy a producción **solo** ocurre con los tres jobs de CI en verde (probado con un PR que falla).
- [ ] **AC-9.2** — Las migraciones se ejecutan automáticamente antes de publicar la versión nueva.
- [ ] **AC-9.3** — Existe `scripts/smoke.sh` con al menos 3 comprobaciones, ejecutado tras cada deploy.
- [ ] **AC-9.4** — Un smoke test fallido dispara rollback automático y alerta.
- [ ] **AC-9.5** — El rollback fue **probado en un simulacro real** y toma menos de 5 minutos.
- [ ] **AC-9.6** — Existe `docs/DESPLIEGUE.md` con el procedimiento normal y el de emergencia.
- [ ] **AC-9.7** — Cada deploy queda registrado con SHA del commit, autor y timestamp, y ese SHA es el `release` de Sentry (`C-08`).
- [ ] **AC-9.8** — La secuencia `staging → producción` es obligatoria: no hay ruta directa desde una rama de trabajo a producción.

### Verificación

Simulacro completo: desplegar un cambio que rompa el smoke test a propósito y confirmar rollback automático, alerta recibida y tiempo total < 5 min. Documentar el resultado.

---

## A-10 · Control de versiones sin proceso

> **Riesgo:** ALTO · **Esfuerzo:** 4 h · **Cumplimiento actual:** 40%

### Evidencia

- 84 commits, todos en `master`; solo una rama remota adicional.
- Sin PRs ni revisión de código.
- Mensajes reales: `mejora`, `mejoras`, `merjora`, `actuazalicion`, `eliminacion de bugs`.
- Sin tags ni releases; sin `CHANGELOG.md`.
- 3,2 MB de binarios versionados en la raíz: `Distancias entre ciudades.xlsx` (1,78 MB) y `Distancias_Ciudades_FINAL.xlsx` (1,51 MB).
- 10 archivos `.md`/`.txt` en la raíz mezclando documentación con prompts para agentes de IA.

### Riesgo

El historial no permite responder "¿qué cambió y por qué?", lo que hace inviable un `git bisect` y complica cualquier auditoría. Sin revisión de código, los hallazgos de este plan pueden revertirse sin que nadie lo note. Los binarios engordan cada clon permanentemente.

### Solución

1. **Branch protection** en `master` (ya requerida en `C-06`): PR + 1 aprobación + checks en verde.
2. **Conventional Commits** validados por `commitlint` en un hook de `husky` y en CI.
3. **Versionado semántico** con tags y `CHANGELOG.md` generado automáticamente.
4. Mover los `.xlsx` a Git LFS o convertirlos al `frontend/src/data/cityDistances.ts` que ya existe, y eliminarlos del árbol.
5. Reorganizar la documentación: `docs/` como raíz única, `docs/historico/` para los `PROMPT_*.md`, y un `README.md` que sea índice real y esté al día (hoy marca como pendientes las fases 2 a 8, ya implementadas).
6. Plantillas de PR e issue con checklist de seguridad y pruebas.

### Criterios de aceptación

- [ ] **AC-10.1** — `master` está protegida: push directo rechazado, PR con 1 aprobación y checks obligatorios.
- [ ] **AC-10.2** — `commitlint` rechaza un mensaje que no siga Conventional Commits, tanto local como en CI.
- [ ] **AC-10.3** — Existe `CHANGELOG.md` y el último release está etiquetado con versión semántica.
- [ ] **AC-10.4** — Los `.xlsx` de la raíz ya no están en el árbol de trabajo; su información está disponible por otra vía.
- [ ] **AC-10.5** — La raíz contiene como máximo 3 archivos de documentación; el resto vive en `docs/`.
- [ ] **AC-10.6** — El `README.md` refleja el estado real: fases, stack, arranque y enlaces a `docs/`.
- [ ] **AC-10.7** — Existen `.github/pull_request_template.md` e `ISSUE_TEMPLATE`.
- [ ] **AC-10.8** — Los 12 hallazgos críticos y los 20 altos están cargados como issues, etiquetados y priorizados.

### Verificación

```bash
git push origin master                       # → rechazado
git commit -m "arreglos varios"              # → rechazado por commitlint
git ls-files '*.xlsx' | wc -l                # → 0
ls *.md | wc -l                              # → ≤ 3
```

---

## A-11 · API sin contrato, versionado ni paginación

> **Riesgo:** ALTO · **Esfuerzo:** 12 h · **Cumplimiento actual:** 55% · **Depende de:** A-01

### Evidencia

- Sin OpenAPI/Swagger: el contrato solo existe en el código.
- Sin versionado: las rutas son `/api/<recurso>`, no `/api/v1/<recurso>`.
- **Sin paginación**: `quotations.ts:419` ejecuta `SELECT … FROM quotations … ORDER BY q.created_at DESC` **sin `LIMIT`**. Igual en clientes, proyectos, catálogo y facturas.
- Sin filtros ni ordenamiento por parámetros.
- Respuestas heterogéneas: unas devuelven `{ error }`, otras `{ error, message }`, otras `{ error, message, code }`.

### Riesgo

`GET /api/quotations` carga en memoria **todas** las cotizaciones con sus totales en cada visita al listado. El coste crece de forma lineal e ilimitada: con unos miles de registros se traduce en timeouts de la función serverless y en un frontend que descarga megabytes por pantalla. Sin versionado, cualquier cambio de contrato rompe a los clientes desplegados.

### Solución

1. **Paginación keyset** (estable y eficiente con el índice `ix_quotations_date` existente):

   ```
   GET /api/v1/quotations?limit=50&cursor=<created_at|id>&status=Emitida&q=texto
   → { data: [...], next_cursor: "…", has_more: true }
   ```

   Límite por defecto 50, máximo 200, validado con los esquemas de `A-01`.
2. **Versionado**: montar todo bajo `/api/v1`, manteniendo `/api/*` como alias con `Deprecation` durante una ventana definida.
3. **OpenAPI** generado desde los esquemas zod (`zod-to-openapi`), publicado en `/api/docs` y **versionado en el repositorio** para detectar cambios de contrato en los PRs.
4. **Formato de error unificado**: `{ error, message, code?, details? }` en todos los endpoints, centralizado en el manejador de errores.
5. `Cache-Control` y `ETag` en los recursos casi estáticos (config, catálogo).

### Criterios de aceptación

- [ ] **AC-11.1** — Todos los listados aceptan `limit` y `cursor` y devuelven `{ data, next_cursor, has_more }`.
- [ ] **AC-11.2** — El `limit` por defecto es 50 y `limit=5000` se rechaza con `400`.
- [ ] **AC-11.3** — Recorrer todas las páginas de un conjunto de 1.000 registros devuelve exactamente 1.000 elementos, **sin duplicados ni omisiones**, incluso si se insertan registros durante el recorrido.
- [ ] **AC-11.4** — El frontend consume la paginación (scroll infinito o paginador) y no descarga listas completas.
- [ ] **AC-11.5** — `/api/docs` sirve la especificación OpenAPI y describe **todos** los endpoints con sus esquemas y códigos de respuesta.
- [ ] **AC-11.6** — El archivo `openapi.json` está versionado; un cambio de contrato produce un diff visible en el PR.
- [ ] **AC-11.7** — Todas las rutas responden bajo `/api/v1`; las antiguas siguen funcionando con cabecera `Deprecation` y fecha de retiro.
- [ ] **AC-11.8** — Todos los errores comparten el mismo formato (verificado con una prueba que recorre los códigos 400/401/403/404/500).
- [ ] **AC-11.9** — `GET /api/v1/quotations` con 10.000 registros en base responde en **< 500 ms (p95)**.
- [ ] **AC-11.10** — Config y catálogo devuelven `ETag`; un `If-None-Match` coincidente responde `304`.

### Verificación

```bash
psql $DB -c "INSERT INTO quotations SELECT … generate_series(1,10000)"   # dataset de prueba
time curl -s "$API/api/v1/quotations?limit=50" -H "$AUTH" | jq '.data | length'   # → 50, < 500 ms
npm test -- pagination        # AC-11.3
```

---

# SPRINT 6 — Calidad y pruebas

---

## A-12 · Lint del frontend nunca ejecutado

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 30%

> **Relación con `C-07`:** `C-07` deja el comando **ejecutable** (instalar `@eslint/js`). `A-12` es el trabajo posterior: triar y corregir los hallazgos, y endurecer las reglas. Se hacen en ese orden.

### Evidencia

`cd frontend && npm run lint` falla con `Cannot find package '@eslint/js'`: el comando nunca se ha ejecutado con éxito en la vida del proyecto. El backend directamente **no tiene** script de lint. No hay formateador (`prettier`) ni configuración de estilo compartida.

### Riesgo

Una primera ejecución sobre ~6.000 líneas de frontend suele revelar decenas de hallazgos reales: dependencias faltantes en `useEffect`, `any` implícitos, variables sin usar, promesas sin `await`. Algunos son bugs latentes, no cuestiones de estilo.

### Solución

1. Ejecutar, contar y **triar** los hallazgos en tres grupos: bugs reales (corregir ya), deuda de estilo (regla en `warn` con `--max-warnings` decreciente), reglas no deseadas (desactivar con justificación).
2. Añadir script de lint al **backend** con la misma configuración base.
3. Reglas mínimas obligatorias en `error`: `no-unused-vars`, `no-floating-promises`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`.
4. Añadir `eslint-plugin-jsx-a11y` (adelanta el hallazgo de accesibilidad, de riesgo medio).
5. `prettier` + `husky` + `lint-staged` para formatear en el pre-commit.
6. Gate en CI: `--max-warnings <N>` con `N` fijado al valor tras el triaje y reducido en cada sprint hasta 0.

### Criterios de aceptación

- [ ] **AC-12.1** — `npm run lint` termina con exit 0 en `frontend/` **y** en `backend/`.
- [ ] **AC-12.2** — Cero errores de lint (los `warning` restantes están acotados por `--max-warnings`).
- [ ] **AC-12.3** — Los hallazgos triados están documentados: cuántos había, cuántos eran bugs reales y cuáles se corrigieron.
- [ ] **AC-12.4** — Las 4 reglas mínimas están en `error` y no se suprimen con `eslint-disable` sin comentario justificativo.
- [ ] **AC-12.5** — `prettier` está configurado y el formato es estable (`npm run format:check` pasa).
- [ ] **AC-12.6** — `husky` + `lint-staged` corren en el pre-commit y el hook está documentado en el README.
- [ ] **AC-12.7** — CI ejecuta el lint de ambos paquetes y bloquea el merge si falla.
- [ ] **AC-12.8** — El umbral `--max-warnings` está registrado con su plan de reducción por sprint.

### Verificación

```bash
(cd frontend && npm run lint) && (cd backend && npm run lint)
npm run format:check
git commit -m "test: hook"     # el hook formatea y bloquea si hay errores
```

---

## A-13 · Cobertura de pruebas unitarias insuficiente

> **Riesgo:** ALTO · **Esfuerzo:** 12 h · **Cumplimiento actual:** 35%

### Evidencia

16 pruebas en 4 archivos frente a ~10.700 líneas de código:

| Con pruebas | Sin **ninguna** prueba |
|---|---|
| `clients.ts`, `quotations.ts` (parcial), `quotations-import.ts`, `maestro-store` | `middleware/auth.ts` (JWT y roles), `api/auth.ts` (login/refresh), `projects.ts` (420 líneas), `invoices.ts`, `dashboard.ts`, `catalog.ts`, `config.ts`, `admin.ts` |

Sin umbral de cobertura ni reporte. Lo más crítico: **la lógica de autenticación y autorización no tiene una sola prueba**, y es exactamente lo que modifican `C-01`, `C-02`, `C-10`, `A-02` y `A-04`.

### Riesgo

Los arreglos de seguridad de este plan no tienen red que impida su regresión. Los cálculos de totales, IVA y márgenes —el núcleo económico del producto— tampoco están cubiertos: un error ahí produce cotizaciones y facturas incorrectas, con impacto comercial y legal directo.

### Solución

Priorizar por riesgo, no por facilidad:

| Prioridad | Área | Casos mínimos |
|---|---|---|
| 1 | `middleware/auth.ts` | token válido, ausente, malformado, expirado, firmado con otro secreto, rol suficiente e insuficiente |
| 2 | `api/auth.ts` | login correcto, contraseña incorrecta, usuario inexistente, inactivo, refresh válido/revocado/rotado |
| 3 | Cálculos | `calcTotals`, `calcCat`, márgenes, IVA, redondeo a 2 decimales, cantidades y días extremos |
| 4 | Transiciones de estado | matriz de estados válidos e inválidos de cotizaciones y facturas |
| 5 | Resto de routers | camino feliz + error principal por endpoint |

Umbral de cobertura: 40% inicial → 60% al cierre del sprint, con `lines` y `branches` medidos por separado.

### Criterios de aceptación

- [ ] **AC-13.1** — Cobertura global ≥ 60% de líneas y ≥ 50% de ramas, verificada en CI.
- [ ] **AC-13.2** — `middleware/auth.ts` tiene ≥ 90% de cobertura y cubre los 7 casos de la prioridad 1.
- [ ] **AC-13.3** — `api/auth.ts` cubre login, refresh, rotación y revocación (integrado con `A-02`).
- [ ] **AC-13.4** — Los cálculos de totales, IVA y márgenes tienen pruebas con valores límite y verificación de redondeo.
- [ ] **AC-13.5** — Cada endpoint tiene al menos una prueba de camino feliz y una de error.
- [ ] **AC-13.6** — El umbral está configurado en `vitest.config.ts` y **la build falla** si la cobertura baja.
- [ ] **AC-13.7** — Las pruebas no dependen de orden de ejecución ni de estado compartido (pasan con `--shuffle`).
- [ ] **AC-13.8** — La suite completa tarda menos de 60 s.
- [ ] **AC-13.9** — Cada hallazgo corregido en los planes de críticos y altos tiene su prueba de regresión asociada, referenciada por ID (`C-02`, `A-02`, …).

### Verificación

```bash
npm test -- --coverage         # AC-13.1, AC-13.6
npm test -- --shuffle          # AC-13.7
```

---

## A-14 · Sin pruebas contra PostgreSQL real

> **Riesgo:** ALTO · **Esfuerzo:** 8 h · **Cumplimiento actual:** 25%

### Evidencia

Las pruebas de API usan `supertest` sobre routers reales pero con un `Pool` **simulado**: las consultas SQL nunca se ejecutan. En consecuencia no se verifican jamás el SQL en sí, los `CHECK`, las claves foráneas, los triggers de `updated_at`, las vistas `v_quotation_totals` y `v_project_spending`, ni el comportamiento transaccional de la importación.

### Riesgo

Un error de sintaxis SQL, una columna renombrada o un `CHECK` violado pasan íntegros por CI y aparecen como `500` en producción. Precisamente la lógica más delicada —totales calculados por vista y transacciones con `ROLLBACK`— es la que no se prueba.

### Solución

1. Servicio `postgres:15` en CI (o Testcontainers en local) con la base creada por las **migraciones** de `C-11`, no por `schema.sql` directo: así se prueban también las migraciones.
2. Estrategia de aislamiento: cada prueba en una transacción con `ROLLBACK` al terminar, o `TRUNCATE … CASCADE` entre pruebas.
3. Fixtures mínimas y explícitas (`createUser`, `createClient`, `createQuotation`).
4. Casos prioritarios: totales de la vista frente al cálculo esperado, importación con fallo a mitad (debe revertir todo), soft-delete (los borrados no aparecen en los listados), unicidad de correlativo bajo concurrencia, y `CHECK` que rechaza cantidades negativas.

```yaml
services:
  postgres:
    image: postgres:15
    env: { POSTGRES_PASSWORD: test, POSTGRES_DB: bravocrm_test }
    options: >-
      --health-cmd pg_isready --health-interval 10s --health-retries 5
```

### Criterios de aceptación

- [ ] **AC-14.1** — Existe una suite de integración separada (`npm run test:integration`) que corre contra PostgreSQL real.
- [ ] **AC-14.2** — La base de pruebas se crea con las migraciones; si una migración falla, la suite falla.
- [ ] **AC-14.3** — Las pruebas son independientes y repetibles: dos ejecuciones seguidas dan el mismo resultado sin limpieza manual.
- [ ] **AC-14.4** — `v_quotation_totals` se valida contra un cálculo esperado, incluidos IVA y márgenes por categoría.
- [ ] **AC-14.5** — Una importación que falla a mitad **no deja datos parciales** (verificado contando filas antes y después).
- [ ] **AC-14.6** — Los `CHECK` se verifican: insertar `quantity = -1` o `iva_pct = 150` es rechazado.
- [ ] **AC-14.7** — El soft-delete se verifica: un registro borrado no aparece en los listados pero sigue en la tabla.
- [ ] **AC-14.8** — La unicidad del correlativo se prueba con dos inserciones concurrentes: una debe fallar limpiamente.
- [ ] **AC-14.9** — La suite corre en CI en menos de 3 minutos.

### Verificación

```bash
docker compose up -d postgres
npm run migrate:up && npm run test:integration
npm run test:integration     # segunda corrida idéntica → AC-14.3
```

---

## A-15 · Sin pruebas end-to-end

> **Riesgo:** ALTO · **Esfuerzo:** 10 h · **Cumplimiento actual:** 0%

### Evidencia

No hay Playwright ni Cypress. Ningún flujo de usuario está verificado de extremo a extremo. El único documento relacionado, `QA_TESTING_GUIDE.md`, describe pruebas **manuales**.

### Riesgo

El valor del producto está en el flujo completo cotización → proyecto → factura, que atraviesa frontend, API, base de datos y exportadores. Hoy solo se verifica manualmente, es decir: de forma inconsistente y no repetible. Una regresión en el login o en el guardado de una cotización llega a producción sin obstáculos.

### Solución

Playwright con 5 escenarios que cubren el 80% del riesgo de regresión:

| # | Escenario | Verifica |
|---|---|---|
| E2E-1 | Login correcto e incorrecto, cierre de sesión | Autenticación, `A-02`, `C-02` |
| E2E-2 | Crear cotización con líneas en 2 categorías y validar totales, IVA y margen en pantalla | Núcleo económico |
| E2E-3 | Cambiar estado a Emitida → Adjudicada y convertir en proyecto | Transiciones y trazabilidad |
| E2E-4 | Registrar costo de ejecución y verificar el indicador de margen | `v_project_spending` |
| E2E-5 | Exportar cotización a PDF y verificar que el archivo se descarga y no está vacío | Exportadores |

Complemento de seguridad: un escenario que inicie sesión como `user` y confirme que las acciones de borrado **no están disponibles** en la UI (`C-10`, AC-10.7).

Ejecución: en cada PR contra el preview de `A-08`, con `trace`, captura y video en caso de fallo.

### Criterios de aceptación

- [ ] **AC-15.1** — Playwright configurado con `npm run test:e2e` y ejecución en CI.
- [ ] **AC-15.2** — Los 5 escenarios están implementados y pasan de forma consistente.
- [ ] **AC-15.3** — Se ejecutan contra el preview del PR, no contra producción.
- [ ] **AC-15.4** — Ante un fallo, CI publica traza, captura y video como artefactos.
- [ ] **AC-15.5** — La suite tarda menos de 5 minutos.
- [ ] **AC-15.6** — Cero flakiness: 10 ejecuciones consecutivas sin fallos intermitentes.
- [ ] **AC-15.7** — Los datos de prueba se crean y limpian solos (no dependen de datos preexistentes).
- [ ] **AC-15.8** — Existe el escenario de permisos por rol y falla si se retira un `roleMiddleware`.
- [ ] **AC-15.9** — `QA_TESTING_GUIDE.md` se actualiza indicando qué quedó automatizado y qué sigue siendo manual.

### Verificación

```bash
npm run test:e2e
for i in $(seq 1 10); do npm run test:e2e || echo "FALLO en corrida $i"; done   # AC-15.6
```

---

# SPRINT 7 — Rendimiento y continuidad

---

## A-16 · Bundle de 2,1 MB sin code-splitting

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 35%

### Evidencia — salida real de `npx vite build`

```
dist/assets/index-BX307YWU.js      2,135.55 kB │ gzip: 683.45 kB
dist/assets/index.es-Dmn3SDvI.js     153.14 kB │ gzip:  50.51 kB
dist/assets/purify.es-BQTsswsr.js     26.69 kB │ gzip:  10.13 kB
(!) Some chunks are larger than 500 kB after minification.
```

`frontend/src/App.tsx:3-9` importa **estáticamente** las 7 páginas. `recharts`, `jspdf`, `html2canvas`, `docx` y `xlsx` entran al chunk inicial aunque solo se usen al abrir el dashboard o al exportar.

**Hallazgo adicional de alto valor:** `react-router` figura en `dependencies` pero `grep -rn "react-router" frontend/src` no devuelve **ninguna** coincidencia — la navegación es por estado (`App.tsx:74`, `currentPage`). Es una dependencia no utilizada que además aporta **5 advisories de severidad alta**: eliminarla mejora simultáneamente el bundle y el resultado de `npm audit` (`C-09`).

### Riesgo

683 kB comprimidos en la carga inicial equivalen a varios segundos en 4G y penalizan especialmente el uso móvil, que es un caso explícito del producto (existe `start-mobile.bat` y modo LAN). Sin presupuesto de rendimiento, el bundle solo crece.

### Solución

1. **Eliminar `react-router`** (no se usa).
2. **Lazy loading por página**:
   ```tsx
   const Dashboard = lazy(() => import('./pages/Dashboard'))
   const Quotations = lazy(() => import('./pages/Quotations'))
   // … envolver en <Suspense fallback={<Spinner/>}>
   ```
3. **Import dinámico de los exportadores**, que solo se necesitan al hacer clic:
   ```ts
   const exportPdf = async (q) => {
     const { generateQuotationPdf } = await import('../utils/pdfExport')
     return generateQuotationPdf(q)
   }
   ```
4. `manualChunks` para separar `recharts` en su propio chunk.
5. **Presupuesto de rendimiento** en CI: fallar si el chunk inicial supera 350 kB gzip.
6. Medir con Lighthouse antes y después.

### Criterios de aceptación

- [ ] **AC-16.1** — El chunk inicial pesa **≤ 350 kB gzip** (desde 683 kB).
- [ ] **AC-16.2** — El build no emite la advertencia de chunks > 500 kB.
- [ ] **AC-16.3** — `jspdf`, `html2canvas`, `docx` y `xlsx`/`exceljs` **no** están en el chunk inicial (verificado en el análisis del bundle).
- [ ] **AC-16.4** — Cada página carga bajo demanda, con indicador de carga visible.
- [ ] **AC-16.5** — `react-router` fue eliminado de `package.json` y `npm audit` ya no reporta sus 5 advisories.
- [ ] **AC-16.6** — CI falla si el chunk inicial supera el presupuesto.
- [ ] **AC-16.7** — Lighthouse en móvil: Performance ≥ 80 y LCP < 2,5 s.
- [ ] **AC-16.8** — Sin regresión funcional: las exportaciones a PDF, DOCX y Excel siguen operativas (cubierto por E2E-5).

### Verificación

```bash
npx vite build && ls -la dist/assets/*.js
npx vite-bundle-visualizer                 # AC-16.3
npx lighthouse $URL --preset=perf --form-factor=mobile   # AC-16.7
```

---

## A-17 · Antipatrón de conexiones en serverless

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 45%

### Evidencia

`backend/src/app.ts:18-24` crea un `pg.Pool` clásico con `max: 5` **a nivel de módulo**, y ese módulo se carga en cada instancia de la función serverless (`api/index.ts:137`). La dependencia `@neondatabase/serverless` está declarada en el `package.json` raíz pero **no se importa en ningún archivo**.

### Riesgo

Cada instancia concurrente de la función abre hasta 5 conexiones. Con 20 instancias son 100 conexiones contra un plan de Neon que típicamente permite bastantes menos: aparecen errores `too many connections` justo en los momentos de mayor uso, es decir, cuando más caro resulta fallar. El problema se agrava con los listados sin paginación de `A-11`, que mantienen las conexiones ocupadas más tiempo.

### Solución

Opción preferida — usar el driver serverless (HTTP, sin conexiones persistentes):

```ts
import { neon } from '@neondatabase/serverless'
const sql = neon(env.DATABASE_URL)
```

Si se prefiere mantener la interfaz `pg` para no reescribir las consultas, usar `Pool` de `@neondatabase/serverless` **contra el endpoint pooler de Neon** y `max: 1`:

```ts
import { Pool } from '@neondatabase/serverless'
export const pool = new Pool({ connectionString: env.DATABASE_URL_POOLED, max: 1 })
```

Complementos: `statement_timeout` de 10 s para que una consulta lenta no bloquee la conexión, y métricas de conexiones activas y errores en la observabilidad de `C-08`.

### Criterios de aceptación

- [ ] **AC-17.1** — La aplicación usa el endpoint pooled de Neon o el driver `@neondatabase/serverless`.
- [ ] **AC-17.2** — Ninguna dependencia declarada queda sin usar (`depcheck` limpio).
- [ ] **AC-17.3** — Una prueba de carga de **50 usuarios concurrentes durante 2 minutos** no produce ningún error `too many connections`.
- [ ] **AC-17.4** — Bajo esa carga, el p95 de `/api/quotations` (ya paginado por `A-11`) se mantiene **< 800 ms**.
- [ ] **AC-17.5** — La tasa de error bajo carga es **< 1%**.
- [ ] **AC-17.6** — `statement_timeout` configurado; una consulta que lo excede devuelve `503` controlado, no un cuelgue.
- [ ] **AC-17.7** — Existe una métrica observable de conexiones activas y errores de conexión.
- [ ] **AC-17.8** — El script de carga (`k6`) está versionado en `scripts/load/` y documentado para repetir la medición.

### Verificación

```bash
k6 run --vus 50 --duration 2m scripts/load/quotations.js
# criterios: http_req_failed < 1%, http_req_duration p(95) < 800ms, 0 errores de conexión
```

---

## A-18 · Sin plan de recuperación ante desastres

> **Riesgo:** ALTO · **Esfuerzo:** 6 h · **Cumplimiento actual:** 10% · **Complementa:** C-12

### Evidencia

No hay plan de DR, ni RTO/RPO acordados, ni réplica, ni runbook, ni región secundaria. Punto único de fallo: la cuenta de Neon. `C-12` cubre el respaldo y su restauración; **este hallazgo cubre el resto de escenarios de desastre**.

### Riesgo

Ante una caída prolongada del proveedor, la pérdida de acceso a una cuenta o un borrado masivo por error humano, no hay procedimiento: las decisiones se toman improvisando, bajo presión y sin saber cuánto se puede perder ni cuánto se tardará.

### Solución

`docs/DR_RUNBOOK.md` con un escenario por sección, cada uno con detección, impacto, pasos numerados, responsable y tiempo objetivo:

| Escenario | Detección | Acción resumida |
|---|---|---|
| Caída de Neon | Alerta de `/api/health` (`C-08`) | Página de mantenimiento; si supera 2 h, restaurar el último dump en un proveedor alternativo |
| Caída de Vercel | Monitor externo | Comunicar; evaluar despliegue alternativo desde el mismo repositorio |
| Corrupción o borrado masivo | Reporte de usuario o anomalía en métricas | PITR de Neon al instante previo; si no basta, restaurar dump (`C-12`) |
| Pérdida de acceso a una cuenta | Fallo de login del administrador | Contacto de recuperación del proveedor; credenciales de emergencia custodiadas |
| Compromiso de credenciales | Alerta de seguridad o actividad anómala | Rotar todos los secretos, `logout-all` (`A-02`), auditar accesos |

Además: **bus factor** — mínimo dos personas con acceso administrativo a cada proveedor, documentado; y credenciales de emergencia en un gestor de contraseñas compartido.

### Criterios de aceptación

- [ ] **AC-18.1** — Existe `docs/DR_RUNBOOK.md` con los 5 escenarios, cada uno con pasos numerados y responsable.
- [ ] **AC-18.2** — RTO (4 h) y RPO (24 h) están acordados con el negocio y escritos.
- [ ] **AC-18.3** — Al menos **dos personas** tienen acceso administrativo a Vercel, Neon, GitHub y el DNS, y está documentado.
- [ ] **AC-18.4** — Las credenciales de emergencia están en un gestor compartido con acceso controlado.
- [ ] **AC-18.5** — **Un simulacro fue ejecutado** (mínimo el escenario de corrupción de datos) y su resultado documentado con tiempos reales.
- [ ] **AC-18.6** — El tiempo medido del simulacro es ≤ RTO; si no, se ajusta el procedimiento o el objetivo.
- [ ] **AC-18.7** — Existe una página o mensaje de mantenimiento que se puede activar sin depender del backend.
- [ ] **AC-18.8** — El runbook tiene fecha de revisión y responsable de mantenerlo (revisión semestral).

### Verificación

Ejecutar el simulacro de corrupción: restaurar a un punto anterior en una base de prueba, cronometrar y registrar en el runbook.

---

## A-19 · Sin requerimientos no funcionales ni SLOs

> **Riesgo:** ALTO · **Esfuerzo:** 4 h · **Cumplimiento actual:** 15%

### Evidencia

No existen RNF explícitos en ninguno de los 10 documentos del repositorio: no hay objetivo de disponibilidad, ni latencia esperada, ni volumetría, ni concurrencia soportada, ni retención de datos, ni RTO/RPO (estos últimos se acuerdan en `A-18`).

### Riesgo

Sin RNF no existe la noción de "suficientemente bueno": no se puede decidir si un p95 de 800 ms es aceptable, si conviene invertir en caché, ni cuándo el sistema está degradado. Todas las decisiones de arquitectura quedan sin criterio objetivo, y las alertas de `C-08` no tienen umbral que las respalde.

### Solución

`docs/RNF_Y_SLOS.md`, breve y medible. Propuesta inicial a validar con el negocio:

| Categoría | Objetivo | Cómo se mide |
|---|---|---|
| Disponibilidad | 99,5% mensual (≈ 3,6 h de indisponibilidad) | Monitor de uptime (`C-08`) |
| Latencia API | p95 < 500 ms, p99 < 1,5 s | Métricas de la plataforma |
| Latencia frontend | LCP < 2,5 s en 4G móvil | Lighthouse en CI (`A-16`) |
| Concurrencia | 50 usuarios simultáneos sin degradación | Prueba de carga (`A-17`) |
| Volumetría a 3 años | 50.000 cotizaciones, 10.000 clientes | Dataset de prueba |
| RPO / RTO | 24 h / 4 h | Simulacro (`C-12`, `A-18`) |
| Retención | Datos de negocio 7 años (obligación tributaria); logs 90 días | Política documentada |
| Navegadores | Últimas 2 versiones de Chrome, Edge, Safari; Safari iOS y Chrome Android | `browserslist` |

Cada SLO debe tener alerta asociada y revisarse trimestralmente con datos reales.

### Criterios de aceptación

- [ ] **AC-19.1** — Existe `docs/RNF_Y_SLOS.md` con los 8 objetivos cuantificados y aprobados por el negocio.
- [ ] **AC-19.2** — Cada SLO indica **cómo se mide** y con qué herramienta.
- [ ] **AC-19.3** — Los SLO medibles automáticamente tienen alerta configurada al alcanzar el 75% del presupuesto de error.
- [ ] **AC-19.4** — `browserslist` está declarado en `package.json` y coincide con el objetivo documentado.
- [ ] **AC-19.5** — Existe un tablero (aunque sea una página) que muestra el estado actual frente a cada SLO.
- [ ] **AC-19.6** — La política de retención está implementada para los logs (borrado automático a 90 días).
- [ ] **AC-19.7** — Los RNF se incorporan a la plantilla de PR: todo cambio significativo declara su impacto en ellos.
- [ ] **AC-19.8** — Revisión trimestral agendada con responsable.

### Verificación

Revisión documental con el negocio, más comprobación de que cada SLO automatizable tiene su alerta activa en la herramienta correspondiente.

---

# SPRINT 8 — Cumplimiento

---

## A-20 · Sin privacidad, términos ni gestión de datos personales

> **Riesgo:** ALTO · **Esfuerzo:** 12 h · **Cumplimiento actual:** 5%

### Evidencia

El sistema almacena datos personales: `clients.rut`, `client_contacts.name`, `.email`, `.telefono`, `.cargo`, además de los datos de los propios usuarios. No hay política de privacidad, ni términos y condiciones, ni aviso de tratamiento, ni procedimiento de borrado a solicitud del titular, ni registro de actividades de tratamiento. El borrado es **soft-delete** (`deleted_at`), es decir, el dato permanece indefinidamente.

### Riesgo

En Chile, el RUT y los datos de contacto son datos personales bajo la Ley 19.628, y la **Ley 21.719** (vigente desde diciembre de 2026) introduce una agencia con potestad sancionatoria y multas relevantes. El soft-delete es directamente incompatible con el derecho de supresión: hoy no existe forma de cumplir una solicitud de borrado. Esto pasa de "recomendable" a **obligatorio** en un plazo conocido.

### Solución

1. **Registro de tratamiento** (`docs/REGISTRO_TRATAMIENTO.md`): qué datos, con qué finalidad, base de licitud, plazo de conservación y con quién se comparten (Vercel, Neon, Sentry, proveedor de correo).
2. **Política de privacidad** y **Términos y condiciones** publicados y enlazados desde el login y el pie de página, con fecha de versión.
3. **Encargados de tratamiento**: verificar y documentar los DPA de cada proveedor, y las transferencias internacionales (todos los proveedores están fuera de Chile).
4. **Derechos ARCO+**: procedimiento documentado y endpoints o proceso operativo para acceso, rectificación, cancelación y oposición, con plazo de respuesta comprometido.
5. **Borrado real**: función de borrado definitivo que elimine o anonimice de forma irreversible los datos personales, preservando los datos contables mínimos exigidos por la normativa tributaria (anonimizar el contacto, conservar el documento).
6. **Minimización**: revisar si todos los campos recolectados son necesarios.
7. **Retención**: aplicar los plazos de `A-19` con un job de purga.
8. **Notificación de brechas**: procedimiento en el runbook de `A-18`.

### Criterios de aceptación

- [ ] **AC-20.1** — Existe `docs/REGISTRO_TRATAMIENTO.md` con todos los datos personales, su finalidad, base de licitud y plazo de conservación.
- [ ] **AC-20.2** — La política de privacidad y los T&C están publicados, versionados y accesibles desde el login y el pie de página.
- [ ] **AC-20.3** — Los DPA de Vercel, Neon, Sentry y el proveedor de correo están revisados y archivados, con las transferencias internacionales documentadas.
- [ ] **AC-20.4** — Existe un procedimiento escrito para atender solicitudes ARCO+ con plazo de respuesta definido.
- [ ] **AC-20.5** — El borrado definitivo está implementado: tras ejecutarlo, `SELECT` sobre las tablas no devuelve ningún dato personal del titular, ni en las filas con `deleted_at`.
- [ ] **AC-20.6** — El borrado preserva la integridad contable: las cotizaciones y facturas se conservan con el contacto anonimizado, sin romper claves foráneas.
- [ ] **AC-20.7** — Existe un job de purga que aplica los plazos de retención y su ejecución queda registrada.
- [ ] **AC-20.8** — Los logs no almacenan datos personales más allá del plazo definido (`A-05`, AC-5.7).
- [ ] **AC-20.9** — El procedimiento de notificación de brechas está en el runbook, con plazos y responsables.
- [ ] **AC-20.10** — Existe un análisis de brecha frente a la Ley 21.719 con plan y fechas antes de su entrada en vigor.

### Verificación

```sql
-- AC-20.5: tras ejecutar el borrado definitivo del contacto <id>
SELECT count(*) FROM client_contacts WHERE id = '<id>' AND (email IS NOT NULL OR telefono IS NOT NULL);  -- → 0
-- AC-20.6
SELECT count(*) FROM quotations WHERE contact_id = '<id>';   -- las cotizaciones siguen existiendo
```

---

# Seguimiento

## Definición de "Hecho"

Idéntica al plan de críticos:

1. Todos los criterios de aceptación verificados por una persona **distinta** de quien implementó.
2. Prueba automatizada en CI que falla si el problema reaparece.
3. Fusionado en `master` vía PR aprobado con CI en verde.
4. Verificado en staging (`A-08`) y luego en producción.

## Tablero de avance

| ID | Hallazgo | Sprint | Estado | Responsable | AC cerrados |
|---|---|:--:|---|---|:--:|
| A-01 | Validación con esquemas | 4 | ☐ Pendiente | | 0/9 |
| A-02 | Sesiones revocables | 4 | ☐ Pendiente | | 0/11 |
| A-03 | Correo con SPF/DKIM/DMARC | 4 | ☐ Pendiente | | 0/8 |
| A-04 | Recuperación de contraseña | 4 | ☐ Pendiente | | 0/10 |
| A-05 | TLS validado y datos personales | 4 | ☐ Pendiente | | 0/8 |
| A-06 | WAF y perímetro | 4 | ☐ Pendiente | | 0/7 |
| A-07 | Entrypoint único | 5 | ☐ Pendiente | | 0/8 |
| A-08 | Entorno de staging | 5 | ☐ Pendiente | | 0/8 |
| A-09 | CD con gates y rollback | 5 | ☐ Pendiente | | 0/8 |
| A-10 | Proceso de control de versiones | 5 | ☐ Pendiente | | 0/8 |
| A-11 | Contrato, versionado y paginación | 5 | ☐ Pendiente | | 0/10 |
| A-12 | Lint operativo y endurecido | 6 | ☐ Pendiente | | 0/8 |
| A-13 | Cobertura de pruebas unitarias | 6 | ☐ Pendiente | | 0/9 |
| A-14 | Pruebas con PostgreSQL real | 6 | ☐ Pendiente | | 0/9 |
| A-15 | Pruebas end-to-end | 6 | ☐ Pendiente | | 0/9 |
| A-16 | Code-splitting y presupuesto | 7 | ☐ Pendiente | | 0/8 |
| A-17 | Conexiones en serverless | 7 | ☐ Pendiente | | 0/8 |
| A-18 | Runbook de desastres | 7 | ☐ Pendiente | | 0/8 |
| A-19 | RNF y SLOs | 7 | ☐ Pendiente | | 0/8 |
| A-20 | Privacidad y datos personales | 8 | ☐ Pendiente | | 0/10 |

**Total: 172 criterios de aceptación.**

## Impacto esperado

| Métrica | Tras críticos | Tras riesgo alto |
|---|---|---|
| Cumplimiento global | 65–70% | **85–90%** |
| Hallazgos críticos | 0 | 0 |
| Hallazgos de riesgo alto | 20 | 0 |
| Cobertura de pruebas | ~40% | ≥ 60% + integración + E2E |
| Bundle inicial (gzip) | 683 kB | ≤ 350 kB |
| Entornos | dev + prod | dev + staging + prod |
| Cumplimiento normativo | Sin cobertura | Ley 19.628 cubierta, 21.719 planificada |

## Riesgos de la ejecución del propio plan

| Riesgo | Mitigación |
|---|---|
| `A-11` (paginación) y `A-16` (lazy loading) tocan mucho frontend a la vez | Ejecutarlos en sprints distintos y apoyarse en los E2E de `A-15` como red |
| `A-02` cambia el esquema de `sessions` en producción | Migración expand → migrate → contract (`C-11`); tolerar ambas columnas durante una ventana |
| `A-12` puede revelar cientos de hallazgos y desbordar el sprint | Fijar el umbral inicial en el número encontrado y reducirlo por sprint, no exigir cero de inmediato |
| `A-20` requiere criterio legal, no solo técnico | Validar la política y los T&C con asesoría legal antes de publicarlos |
| Los hallazgos altos compiten con nuevas funcionalidades | Reservar un porcentaje fijo de capacidad por sprint (p. ej. 40%) y protegerlo |

## Fuera de alcance

Quedan pendientes los **13 hallazgos de riesgo medio** y los **7 de riesgo bajo** de `docs/AUDITORIA_QA_2026-07.html`: colas y tareas en segundo plano, caché de datos, accesibilidad WCAG, analítica, costos de infraestructura, auditoría de cambios en base de datos, índices de búsqueda de texto, actualización del Service Worker y consolidación documental, entre otros. Se planifican tras cerrar este plan.
