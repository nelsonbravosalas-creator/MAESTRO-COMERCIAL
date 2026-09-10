# Plan de Remediación — Hallazgos Críticos

**Proyecto:** MAESTRO-COMERCIAL / BravoCRM
**Base:** Auditoría QA `docs/AUDITORIA_QA_2026-07.html` (commit `fbff2c8`, rama `master`)
**Alcance:** los 12 hallazgos clasificados como **CRÍTICOS**. Excluye el ítem de Pagos.
**Rol:** Ingeniero Senior Full Stack
**Duración estimada:** 8–10 días/persona repartidos en 3 sprints

---

## 0. Cómo usar este documento

Cada hallazgo (`C-01` … `C-12`) contiene:

| Campo | Descripción |
|---|---|
| **Severidad / Esfuerzo** | Impacto y coste estimado en horas |
| **Evidencia** | Archivo y línea exactos donde se verificó el problema |
| **Riesgo** | Qué ocurre concretamente si no se corrige |
| **Solución** | Cambio técnico propuesto, con código |
| **Criterios de aceptación** | Condiciones verificables (`AC-x.y`). Un hallazgo se cierra **solo** cuando todos sus AC pasan |
| **Verificación** | Comando o procedimiento exacto para probar cada AC |

**Regla de cierre:** ningún hallazgo se marca como resuelto sin que exista una **prueba automatizada en CI** que falle si el problema reaparece. Un arreglo sin prueba de regresión es un arreglo temporal.

### Orden de ejecución

```
SPRINT 1 (Seguridad, 2-3 días)   C-01 → C-02 → C-03 → C-04 → C-05
SPRINT 2 (Red de seguridad, 3 d) C-06 → C-07 → C-08 → C-09
SPRINT 3 (Datos y esquema, 3 d)  C-10 → C-11 → C-12
```

El orden importa: `C-06` (CI) depende de `C-07` (suite ejecutable), y todos los AC de los sprints 1 y 3 se blindan con el CI construido en el sprint 2.

### Resumen

| ID | Hallazgo | Dominio | Esfuerzo | Sprint |
|---|---|---|---|---|
| C-01 | Secretos con valor por defecto (`'default-secret'`) | AuthN | 3 h | 1 |
| C-02 | `ALLOW_NO_PIN` permite login sin contraseña | AuthN | 1 h | 1 |
| C-03 | CORS reflejante con `credentials: true` | CSRF | 2 h | 1 |
| C-04 | Sin hardening HTTP ni rate limiting | Vulnerabilidades | 4 h | 1 |
| C-05 | Credenciales reales versionadas en el repositorio | Credenciales | 4 h | 1 |
| C-06 | Sin integración continua | CI/CD | 6 h | 2 |
| C-07 | Suite de calidad no ejecutable en clon limpio | Pruebas | 4 h | 2 |
| C-08 | Sin observabilidad ni alertas | Observabilidad | 6 h | 2 |
| C-09 | 9 vulnerabilidades en dependencias de producción | Terceros | 6 h | 2 |
| C-10 | Autorización por rol aplicada solo en 4 rutas | AuthZ | 8 h | 3 |
| C-11 | Sin herramienta de migraciones | Base de datos | 8 h | 3 |
| C-12 | Backups no verificados | Continuidad | 6 h | 3 |

---

# SPRINT 1 — Blindaje de seguridad

---

## C-01 · Secretos con valor por defecto

> **Severidad:** CRÍTICA · **Esfuerzo:** 3 h · **Dominio:** Autenticación / Secretos

### Evidencia

| Archivo | Línea | Código |
|---|---|---|
| `backend/src/api/auth.ts` | 10 | `const jwtSecret = () => process.env.JWT_SECRET \|\| 'default-secret'` |
| `backend/src/middleware/auth.ts` | 37, 87 | `jwt.verify(token, process.env.JWT_SECRET \|\| 'default-secret')` |
| `api/index.ts` | 8 | `const JWT_SECRET = process.env.JWT_SECRET \|\| 'dev-secret-maestro'` |

### Riesgo

Si `JWT_SECRET` no está definido en el entorno (despliegue nuevo, variable mal escrita, preview de Vercel sin configurar), la aplicación **arranca igual** y firma tokens con un secreto que está publicado en un repositorio de GitHub. Cualquiera puede generar un token válido con `role: 'admin'`:

```js
jwt.sign({ id:'…', email:'x@x.cl', name:'x', role:'admin' }, 'default-secret')
```

Es un bypass total de autenticación y autorización. El mismo patrón afecta a `JWT_EXPIRY` y `ADMIN_SETUP_SECRET`.

### Solución

Validación de entorno **fail-fast** en el arranque. Crear `backend/src/config/env.ts`:

```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRY: z.string().default('8h'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  ADMIN_SETUP_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z.string(),
  LOG_LEVEL: z.string().default('info'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Configuración de entorno inválida:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
```

Reemplazar **todas** las lecturas de `process.env.JWT_SECRET` por `env.JWT_SECRET` y eliminar los operadores `||` con literales. Actualizar `backend/.env.example` (hoy declara `JWT_EXPIRY=7d` mientras el código usa `8h`: corregir la discrepancia).

Generar el secreto real con `openssl rand -base64 48` y cargarlo en Vercel para los tres entornos.

### Criterios de aceptación

- [ ] **AC-1.1** — `grep -rn "default-secret\|dev-secret-maestro" backend/src api/` devuelve **0 coincidencias**.
- [ ] **AC-1.2** — Con `JWT_SECRET` sin definir, el proceso termina con **exit code ≠ 0** y un mensaje que nombra la variable faltante. No debe quedar escuchando en el puerto.
- [ ] **AC-1.3** — Con `JWT_SECRET` de menos de 32 caracteres, el arranque falla con el mismo comportamiento.
- [ ] **AC-1.4** — Con todas las variables correctas, el servidor arranca y `GET /api/health` responde `200`.
- [ ] **AC-1.5** — `backend/.env.example` lista todas las variables del esquema y `JWT_EXPIRY` coincide con el valor por defecto del código.
- [ ] **AC-1.6** — Existe una prueba automatizada que importa `config/env.ts` con entorno incompleto y espera el fallo.
- [ ] **AC-1.7** — El `JWT_SECRET` de producción fue **rotado** después del cambio (invalida los tokens emitidos con el secreto anterior).

### Verificación

```bash
JWT_SECRET= npm start                 # AC-1.2 → exit ≠ 0
JWT_SECRET=corto npm start            # AC-1.3 → exit ≠ 0
grep -rn "default-secret" backend/src api/   # AC-1.1 → sin salida
npm test -- env                       # AC-1.6
```

---

## C-02 · `ALLOW_NO_PIN` permite iniciar sesión sin contraseña

> **Severidad:** CRÍTICA · **Esfuerzo:** 1 h · **Dominio:** Autenticación

### Evidencia

`backend/src/api/auth.ts:47,56,91` y `api/index.ts:45,50,65`:

```ts
const allowNoPIN = process.env.ALLOW_NO_PIN === 'true'
...
} else if (allowNoPIN) {
  passwordMatch = true       // ← autenticación concedida sin verificar nada
}
```

### Riesgo

Una sola variable de entorno mal puesta en producción convierte el sistema en **acceso público**: basta conocer un correo (ambos están publicados en el `README.md`) para entrar como administrador. El código de bypass no debe existir en el binario de producción, independientemente de su configuración.

### Solución

Eliminar por completo las 6 apariciones. Para desarrollo local, el mecanismo correcto es un **seed** con usuarios de prueba y contraseña conocida (`npm run seed`), no un bypass en el camino de autenticación.

```diff
-      const allowNoPIN = process.env.ALLOW_NO_PIN === 'true'
-      if (!password && !allowNoPIN) {
+      if (!password) {
         return res.status(400).json({ error: 'Bad request', message: 'PIN es requerido' })
       }
...
-      let passwordMatch = false
-      if (password) {
-        passwordMatch = await bcrypt.compare(String(password), user.password_hash)
-      } else if (allowNoPIN) {
-        passwordMatch = true
-      }
+      const passwordMatch = await bcrypt.compare(String(password), user.password_hash)
```

### Criterios de aceptación

- [ ] **AC-2.1** — `grep -rni "allow_no_pin\|allowNoPIN" .` (excluyendo `node_modules` y `.git`) devuelve **0 coincidencias**.
- [ ] **AC-2.2** — `POST /api/auth/login` con `{ email: "<válido>" }` y sin `password` responde `400`, **con la variable `ALLOW_NO_PIN=true` presente en el entorno**.
- [ ] **AC-2.3** — `POST /api/auth/login` con `password: ""`, `null`, `0` o `false` responde `400` o `401`; nunca `200`.
- [ ] **AC-2.4** — El login con credenciales correctas sigue devolviendo `200` con `token` y `refresh_token`.
- [ ] **AC-2.5** — La variable `ALLOW_NO_PIN` fue eliminada del panel de Vercel en los tres entornos.
- [ ] **AC-2.6** — Existe una prueba de regresión con `ALLOW_NO_PIN=true` que exige `400`.

### Verificación

```bash
ALLOW_NO_PIN=true npm test -- auth    # AC-2.2, AC-2.6
curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/auth/login \
  -H 'content-type: application/json' -d '{"email":"nbravo.nbyb@gmail.com"}'   # → 400
```

---

## C-03 · CORS reflejante combinado con `credentials: true`

> **Severidad:** CRÍTICA · **Esfuerzo:** 2 h · **Dominio:** CSRF / Configuración

### Evidencia

`backend/src/app.ts:28-31`:

```ts
app.use(cors({
  origin: (_origin, callback) => callback(null, true),   // acepta CUALQUIER origen
  credentials: true,
}))
```

`backend/src/server.ts:28-31` usa una configuración distinta (`FRONTEND_URL`), lo que confirma el drift entre entrypoints descrito en la auditoría.

### Riesgo

La API devuelve `Access-Control-Allow-Origin` con el valor del origen atacante y `Access-Control-Allow-Credentials: true`. Cualquier sitio web que visite un usuario autenticado puede leer sus cotizaciones, clientes y facturas desde su navegador. Además, deja el sistema sin ninguna defensa CSRF el día que se migre el token a cookie (recomendado en `C-05`).

### Solución

Allowlist explícita desde variable de entorno, con rechazo activo:

```ts
const allowed = env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)          // curl, health checks, apps móviles
    if (allowed.includes(origin)) return cb(null, true)
    return cb(new Error(`Origen no permitido: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  maxAge: 86400,
}))
```

`ALLOWED_ORIGINS` en producción = dominio de la app; en desarrollo = `http://localhost:5173,http://localhost:4000`.

Aprovechar para **unificar los entrypoints**: `server.ts` debe pasar a ser únicamente `import app from './app'; app.listen(port)`.

### Criterios de aceptación

- [ ] **AC-3.1** — Una petición con `Origin: https://evil.example` **no** recibe cabecera `Access-Control-Allow-Origin`.
- [ ] **AC-3.2** — Una petición con `Origin` de la allowlist recibe `Access-Control-Allow-Origin` con ese valor exacto (nunca `*`).
- [ ] **AC-3.3** — Una petición sin cabecera `Origin` (curl, monitor de uptime) sigue funcionando.
- [ ] **AC-3.4** — `preflight OPTIONS` desde un origen permitido responde `204` con los métodos declarados.
- [ ] **AC-3.5** — `backend/src/server.ts` ya no define su propio middleware de CORS ni sus propios routers: delega en `app.ts`.
- [ ] **AC-3.6** — Existe una prueba con supertest que envía `Origin: https://evil.example` y verifica la ausencia de la cabecera.

### Verificación

```bash
curl -sI -H 'Origin: https://evil.example' $API/api/health | grep -i access-control-allow-origin   # sin salida
curl -sI -H "Origin: $APP_ORIGIN"          $API/api/health | grep -i access-control-allow-origin   # eco del origen
```

---

## C-04 · Sin hardening HTTP ni límite de intentos

> **Severidad:** CRÍTICA · **Esfuerzo:** 4 h · **Dominio:** Vulnerabilidades conocidas

### Evidencia

- No hay `helmet` ni `express-rate-limit` en ningún `package.json`.
- `backend/src/app.ts:49` registra el manejador de errores **antes** que el `404` de la línea 56 (orden invertido en Express).
- `backend/src/app.ts:32` aplica `limit: '10mb'` a todos los endpoints, incluido `/api/auth/login`.
- Contraseña = PIN de 4 dígitos → **10.000 combinaciones**, sin bloqueo de cuenta.

### Riesgo

Un script recorre las 10.000 combinaciones de PIN en minutos. No hay HSTS, `X-Frame-Options` (clickjacking), `X-Content-Type-Options` ni `Referrer-Policy`. El orden invertido de middlewares hace que las rutas inexistentes no siempre respondan `404` correctamente.

### Solución

```ts
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

app.set('trust proxy', 1)          // necesario tras el proxy de Vercel para que req.ip sea real
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: false,    // el CSP del frontend se define aparte
}))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: req => `${req.ip}:${String(req.body?.email ?? '').toLowerCase()}`,
  standardHeaders: true,
  message: { error: 'Too many requests', message: 'Demasiados intentos. Reintente en 15 minutos.' },
})
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120 })

app.use('/api', apiLimiter)
app.use('/api/auth/login', loginLimiter)
app.use('/api/admin/setup', rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }))

app.use(bodyParser.json({ limit: '256kb' }))                       // por defecto restrictivo
app.use('/api/quotations/import', bodyParser.json({ limit: '10mb' }))  // excepción explícita
```

Corregir el orden: **rutas → 404 → manejador de errores**.

Elevar el mínimo de contraseña a 8 caracteres para usuarios nuevos y añadir bloqueo temporal tras 10 fallos (columnas `failed_login_attempts` y `locked_until` en `users`).

### Criterios de aceptación

- [ ] **AC-4.1** — La respuesta incluye `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options` y `referrer-policy`.
- [ ] **AC-4.2** — La cabecera `x-powered-by: Express` **no** está presente.
- [ ] **AC-4.3** — El **6.º** intento de login fallido en 15 min desde la misma IP+email responde `429`.
- [ ] **AC-4.4** — El límite se aplica por combinación IP+email: un usuario distinto desde la misma IP no queda bloqueado por el anterior.
- [ ] **AC-4.5** — Un `POST` de 1 MB a `/api/quotations` responde `413`; el mismo tamaño a `/api/quotations/import` se acepta.
- [ ] **AC-4.6** — Una `GET` a una ruta inexistente responde `404` con `{ error: 'Not found' }` (no `500`).
- [ ] **AC-4.7** — Tras 10 fallos, la cuenta queda bloqueada 30 min y el login correcto también responde `423`/`401` durante ese periodo; el contador se reinicia tras un login exitoso.
- [ ] **AC-4.8** — Pruebas automatizadas cubren AC-4.3, AC-4.6 y AC-4.7.

### Verificación

```bash
curl -sI $API/api/health | grep -iE 'strict-transport|x-content-type|x-frame|referrer'   # AC-4.1
for i in $(seq 1 6); do curl -s -o /dev/null -w '%{http_code} ' -X POST $API/api/auth/login \
  -H 'content-type: application/json' -d '{"email":"a@b.cl","password":"0000"}'; done     # → 401 401 401 401 401 429
curl -s -o /dev/null -w '%{http_code}\n' $API/api/no-existe                                # → 404
```

---

## C-05 · Credenciales reales versionadas en el repositorio

> **Severidad:** CRÍTICA · **Esfuerzo:** 4 h · **Dominio:** Almacenamiento de credenciales

### Evidencia

| Ubicación | Contenido |
|---|---|
| `backend/db.json` | Usuarios de producción con sus hashes bcrypt reales |
| `api/index.ts:12-30` | Los **mismos hashes** hardcodeados en `TEST_USERS` |
| `README.md` | Tabla con correos y **PIN en texto plano** (`3571`, `4321`) |
| `frontend/.env.lan`, `frontend/.env.production` | Versionados pese a que `.gitignore` declara `.env*` |
| `docker-compose.yml` | `bravocrm_password`, pgAdmin `admin/admin` |
| `frontend/src/api/api.ts:14` | Token en `localStorage` (accesible desde cualquier XSS) |

### Riesgo

Un hash bcrypt de un PIN de 4 dígitos se rompe **offline en segundos** (10.000 candidatos). El repositorio expone, en la práctica, las credenciales de administrador en texto plano. Además, `TEST_USERS` en `api/index.ts` es una **puerta trasera activa**: si `DATABASE_URL` falta, la función serverless autentica contra esa lista hardcodeada.

### Solución

1. Eliminar `backend/db.json` del repositorio y añadirlo a `.gitignore`.
2. Eliminar el bloque `TEST_USERS` y toda la rama `fallback` de `api/index.ts`: sin base de datos, la API debe responder `503`, nunca autenticar.
3. Reemplazar en `README.md` la tabla de credenciales por una referencia a `POST /api/admin/setup`.
4. `git rm --cached frontend/.env.lan frontend/.env.production`.
5. **Rotar todos los PIN** y migrar a contraseñas de 8+ caracteres.
6. Parametrizar `docker-compose.yml` con variables de entorno.
7. Mover el token a cookie `httpOnly; Secure; SameSite=Strict` (posible ya con la allowlist de `C-03`); si se difiere, reducir el access token a 1 h y documentar la deuda.
8. Ejecutar un escáner de secretos (`gitleaks detect`) sobre todo el historial y evaluar purga con `git filter-repo`.

### Criterios de aceptación

- [ ] **AC-5.1** — `backend/db.json` no está versionado y figura en `.gitignore`.
- [ ] **AC-5.2** — `grep -rn '\$2[aby]\$' --include='*.ts' --include='*.json' . ` (sin `node_modules`) devuelve **0 coincidencias** fuera de las pruebas.
- [ ] **AC-5.3** — `api/index.ts` no contiene usuarios hardcodeados; sin `DATABASE_URL` responde `503` a `/api/auth/login`.
- [ ] **AC-5.4** — El `README.md` no contiene ningún PIN ni contraseña.
- [ ] **AC-5.5** — Todos los PIN de producción fueron rotados **después** de fusionar el cambio, y los nuevos tienen ≥ 8 caracteres.
- [ ] **AC-5.6** — `gitleaks detect --no-git` sobre el árbol de trabajo termina sin hallazgos, y `gitleaks` corre en CI (ver `C-06`).
- [ ] **AC-5.7** — `docker-compose.yml` no contiene contraseñas literales.
- [ ] **AC-5.8** — Decisión sobre el token documentada: cookie `httpOnly` implementada, o ADR que justifique la postergación con fecha de revisión.

### Verificación

```bash
git ls-files | grep -E 'db\.json|\.env'          # AC-5.1, sin .env versionados
gitleaks detect --no-git --redact                # AC-5.6
DATABASE_URL= curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/api/auth/login -d '{}'  # → 503
```

---

# SPRINT 2 — Red de seguridad

---

## C-06 · Sin integración continua

> **Severidad:** CRÍTICA · **Esfuerzo:** 6 h · **Dominio:** CI/CD · **Depende de:** C-07

### Evidencia

No existe el directorio `.github`. Los 84 commits del repositorio se fusionaron directamente en `master`, sin lint, sin tipos, sin pruebas y sin auditoría de dependencias. `master` se despliega automáticamente a producción.

### Riesgo

Ningún control de calidad se ejecuta jamás de forma automática. Todos los criterios de aceptación de este plan son reversibles en el siguiente commit si nada los vigila. **Este hallazgo es el que da permanencia a los otros once.**

### Solución

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push: { branches: [master] }

jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix: { workspace: [backend, frontend] }
    defaults: { run: { working-directory: ${{ matrix.workspace }} } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm, cache-dependency-path: ${{ matrix.workspace }}/package-lock.json }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint --if-present
      - run: npm test
      - run: npm audit --omit=dev --audit-level=high

  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
```

Añadir un job `integration` con el servicio `postgres:15` que aplique `schema.sql` y ejecute las pruebas contra base de datos real.

Configurar en GitHub: **branch protection** en `master` con PR obligatorio, ≥1 aprobación y los checks `quality (backend)`, `quality (frontend)` y `secrets` como requeridos. En Vercel, condicionar el deploy de producción al éxito de CI.

> Nota: el workflow fija Node 22 porque Vite 8 exige ≥ 20.19; la máquina de auditoría con Node 20.18.1 ya emitía la advertencia.

### Criterios de aceptación

- [ ] **AC-6.1** — Existe `.github/workflows/ci.yml` y se ejecuta en cada PR.
- [ ] **AC-6.2** — El pipeline corre, para backend y frontend: `npm ci`, `tsc --noEmit`, `lint`, `test` y `npm audit --audit-level=high`.
- [ ] **AC-6.3** — Un PR que introduzca un error de tipos **falla** el check (probado deliberadamente).
- [ ] **AC-6.4** — Un PR que introduzca un secreto de prueba **falla** el job `secrets`.
- [ ] **AC-6.5** — `master` está protegida: no admite push directo y exige los tres checks en verde.
- [ ] **AC-6.6** — El pipeline completo tarda **menos de 5 minutos**.
- [ ] **AC-6.7** — El deploy a producción solo ocurre con CI en verde.
- [ ] **AC-6.8** — Existe un job de integración con PostgreSQL real que aplica `schema.sql`.

### Verificación

Abrir un PR de prueba con (a) un `const x: number = 'texto'` y (b) una cadena tipo AWS key; ambos deben bloquear el merge. Revertir después.

---

## C-07 · La suite de calidad no se puede ejecutar

> **Severidad:** CRÍTICA · **Esfuerzo:** 4 h · **Dominio:** Pruebas · **Bloquea:** C-06

### Evidencia — comandos ejecutados sobre un clon limpio

| Comando | Resultado |
|---|---|
| `cd frontend && npm run lint` | ❌ `Cannot find package '@eslint/js'` — `eslint.config.js` lo importa y no está en `devDependencies` |
| `cd frontend && npm test` | ❌ `ERR_REQUIRE_ESM` en `html-encoding-sniffer` (jsdom) — **0 pruebas ejecutadas** |
| `cd backend && npm test` | ❌ `Cannot find module '@rolldown/binding-linux-x64-gnu'` |
| `cd backend && npm test` *(tras instalar el binding a mano)* | ✅ **16/16 pruebas pasan** en 1,38 s |
| `cd frontend && npx vite build` | ❌ sin el binding; ✅ tras instalarlo |

### Riesgo

Las tres verificaciones de calidad del proyecto están rotas simultáneamente. No se puede construir CI (`C-06`) sobre una suite que no arranca, y el lint del frontend **nunca** se ha ejecutado, por lo que su primera ejecución probablemente revele decenas de hallazgos acumulados.

### Solución

1. **Lint:** `npm i -D @eslint/js eslint-plugin-react-hooks eslint-plugin-react-refresh` en `frontend/`. Ejecutar, triar y corregir; convertir en `warn` lo que no sea corregible de inmediato, dejando `--max-warnings` acotado y decreciente.
2. **jsdom:** el fallo proviene de `jsdom@29` con `html-encoding-sniffer` en CommonJS bajo Node 20. Fijar `jsdom` a una versión compatible o migrar a `happy-dom` (más rápido y sin esa cadena):
   ```ts
   // vitest.config.ts
   export default defineConfig({ test: { environment: 'happy-dom' } })
   ```
3. **rolldown:** el binding es una `optionalDependency`. Verificar que la instalación no use `--no-optional`/`--omit=optional`, regenerar los `package-lock.json` y fijar Node 22 (`.nvmrc` + `engines`).
4. Añadir cobertura con `@vitest/coverage-v8` y umbral inicial del 40%, escalonado a 60%.

### Criterios de aceptación

- [ ] **AC-7.1** — En un clon limpio: `cd frontend && npm ci && npm run lint` termina con **exit 0**.
- [ ] **AC-7.2** — En un clon limpio: `cd frontend && npm ci && npm test` ejecuta **≥ 1 prueba** y termina con exit 0.
- [ ] **AC-7.3** — En un clon limpio: `cd backend && npm ci && npm test` ejecuta las 16 pruebas sin instalación manual.
- [ ] **AC-7.4** — En un clon limpio: `cd frontend && npm ci && npm run build` genera `dist/` sin errores.
- [ ] **AC-7.5** — Existen `.nvmrc` y `engines.node` coherentes con la versión usada en CI.
- [ ] **AC-7.6** — El reporte de cobertura se genera y el umbral configurado (≥ 40%) se cumple.
- [ ] **AC-7.7** — Los 4 comandos anteriores se ejecutan en CI (`C-06`) y bloquean el merge si fallan.

### Verificación

```bash
rm -rf /tmp/v && git clone <repo> /tmp/v && cd /tmp/v
(cd backend  && npm ci && npx tsc --noEmit && npm test)
(cd frontend && npm ci && npm run lint && npm test && npm run build)
```

Los cuatro bloques deben terminar en exit 0 **sin ningún paso manual**.

---

## C-08 · Sin observabilidad ni alertas

> **Severidad:** CRÍTICA · **Esfuerzo:** 6 h · **Dominio:** Observabilidad

### Evidencia

Solo existe `GET /api/health`. No hay APM, ni error tracking, ni métricas, ni alertas, ni tracing. Winston está bien configurado (`backend/src/utils/logger.ts`) pero en serverless escribe a stdout de Vercel, con retención corta y sin búsqueda. El middleware de logging de peticiones existe únicamente en `server.ts:35`, que **no es el entrypoint de producción**.

### Riesgo

Hoy la única forma de enterarse de una caída o de un error recurrente es que un usuario lo reporte por teléfono. No hay forma de responder "¿desde cuándo falla?", "¿a cuántos usuarios afecta?" ni "¿qué cambió?".

### Solución

1. **Error tracking:** Sentry en frontend (`@sentry/react`) y en la función serverless (`@sentry/node`), con `release` = SHA del commit y source maps subidos en el build.
2. **Correlation id:** middleware en `app.ts` que genere `crypto.randomUUID()`, lo propague a `logger.child({ requestId })` y lo devuelva en la cabecera `x-request-id`.
3. **Logging de peticiones** en `app.ts` (método, ruta, status, duración, requestId, userId), con redacción de PII.
4. **Uptime:** monitor externo (Better Stack / UptimeRobot) sobre `/api/health` cada minuto, con alerta a correo y WhatsApp tras 2 fallos consecutivos.
5. **Health check real:** que `/api/health` ejecute `SELECT 1` y devuelva `503` si la base de datos no responde (hoy devuelve `status: 'ok'` sin comprobar nada).

### Criterios de aceptación

- [ ] **AC-8.1** — Un error no controlado en un endpoint aparece en Sentry en < 1 min, con stack trace, `release` y `requestId`.
- [ ] **AC-8.2** — Un error de JavaScript en el frontend aparece en Sentry con source map resuelto (líneas legibles, no minificadas).
- [ ] **AC-8.3** — Toda respuesta incluye `x-request-id`, y ese mismo id aparece en todas las líneas de log de esa petición.
- [ ] **AC-8.4** — `GET /api/health` responde `503` cuando la base de datos es inalcanzable, y `200` con `db: 'ok'` cuando responde.
- [ ] **AC-8.5** — El monitor de uptime está activo y **se probó una alerta real** (caída simulada → notificación recibida).
- [ ] **AC-8.6** — Ningún log contiene contraseñas, hashes ni tokens (revisión sobre una muestra de 100 líneas).
- [ ] **AC-8.7** — Existe un runbook de 1 página: a quién avisar, dónde mirar y cómo hacer rollback.

### Verificación

Desplegar un endpoint temporal `/api/_boom` que lance una excepción, confirmar la entrada en Sentry y eliminarlo. Pausar el proyecto de Neon durante 2 minutos y verificar `503` + alerta.

---

## C-09 · Vulnerabilidades en dependencias de producción

> **Severidad:** CRÍTICA · **Esfuerzo:** 6 h · **Dominio:** Terceros

### Evidencia — `npm audit --omit=dev`

**Backend — 6 vulnerabilidades (1 crítica, 3 altas, 1 moderada, 1 baja):**

| Paquete | Problema |
|---|---|
| `bcrypt 5.1.1` → `@mapbox/node-pre-gyp` → `tar` | Cadena con la vulnerabilidad crítica (DoS por recursión no controlada) |
| `uuid < 11.1.1` | Falta comprobación de límites de buffer en v3/v5/v6 |

**Frontend — 3 vulnerabilidades (2 altas, 1 moderada):**

| Paquete | Problema |
|---|---|
| `react-router 6.0.0–8.2.0` | 5 advisories: open redirect, XSS en `RSCErrorHandler`, inyección de constructor, DoS por route matching, bypass CSRF en RSC |
| `dompurify` (transitiva de `jspdf`) | 3 advisories de bypass de sanitización |
| `xlsx` | Prototype pollution + ReDoS — **sin parche disponible** |

### Riesgo

`xlsx` procesa archivos subidos por el usuario en el importador de cotizaciones: prototype pollution con entrada no confiable es explotable. `react-router` tiene un DoS no autenticado. Sin Dependabot, la ventana de exposición ante un nuevo CVE es indefinida.

### Solución

| Acción | Efecto |
|---|---|
| Eliminar `bcrypt` (nativo) y dejar solo `bcryptjs` (ya presente y en uso) | Resuelve **4** vulnerabilidades de la cadena `node-pre-gyp`/`tar` y simplifica el build serverless |
| `npm i react-router@latest` | Resuelve 5 advisories altos |
| `npm i uuid@latest` o usar `crypto.randomUUID()` nativo | Resuelve 1 moderada |
| Actualizar `jspdf` (arrastra `dompurify` parcheado) | Resuelve 3 moderadas |
| Reemplazar `xlsx` por `exceljs` | Único camino: `xlsx` no tiene parche |
| Activar Dependabot (`.github/dependabot.yml`, semanal, agrupado) | Reduce la ventana futura |
| `npm audit --audit-level=high` en CI | Impide regresión |

> Regla de cadena de suministro: preferir versiones publicadas hace **≥ 7 días** y evitar rangos flotantes.

### Criterios de aceptación

- [ ] **AC-9.1** — `npm audit --omit=dev --audit-level=high` termina con **exit 0** en backend y frontend.
- [ ] **AC-9.2** — `bcrypt` ya no figura en `backend/package.json`; toda la verificación de contraseñas usa `bcryptjs` y **los hashes existentes siguen validando** (son compatibles).
- [ ] **AC-9.3** — `xlsx` fue reemplazado por `exceljs` y la exportación e importación de Excel siguen funcionando (probado con `docs/ejemplo-import-cotizacion.json` y un archivo real).
- [ ] **AC-9.4** — `react-router`, `uuid` y `jspdf` actualizados; navegación, PDF y exportaciones verificadas manualmente.
- [ ] **AC-9.5** — Existe `.github/dependabot.yml` con actualizaciones semanales para `npm` en las tres raíces (`/`, `/backend`, `/frontend`).
- [ ] **AC-9.6** — Las vulnerabilidades residuales (si alguna queda sin parche) están documentadas en `docs/RIESGOS_ACEPTADOS.md` con justificación, mitigación y fecha de revisión.
- [ ] **AC-9.7** — Las dependencias `runtime` duplicadas del `package.json` raíz fueron eliminadas o unificadas en workspaces (hoy Express 5 en la raíz vs Express 4 en `backend/`).

### Verificación

```bash
(cd backend  && npm audit --omit=dev --audit-level=high)
(cd frontend && npm audit --omit=dev --audit-level=high)
npm ls bcrypt xlsx        # sin resultados
```

---

# SPRINT 3 — Datos, esquema y continuidad

---

## C-10 · Autorización por rol aplicada solo en 4 rutas

> **Severidad:** CRÍTICA · **Esfuerzo:** 8 h · **Dominio:** Autorización

### Evidencia

`roleMiddleware` existe y funciona correctamente, pero solo se usa en:

- `catalog.ts:58, 79, 107`
- `config.ts:22`

Los routers de **quotations, projects, clients, invoices y dashboard** aplican únicamente `authMiddleware`. En consecuencia, un usuario con rol `user` puede invocar:

```
DELETE /api/quotations/:id            (quotations.ts:840)
PATCH  /api/quotations/:id/status     (quotations.ts:791)
DELETE /api/projects/:id              (projects.ts:173)
DELETE /api/clients/:id               (clients.ts:219)
DELETE /api/invoices/:id              (invoices.ts:152)
PATCH  /api/invoices/:id/status       (invoices.ts:149)
```

En el frontend: **0 coincidencias** de comprobación de rol (`grep -rn "role ===" frontend/src`).

### Riesgo

El modelo de roles del README (`admin` / `manager` / `user`) es decorativo. Cualquier cuenta autenticada tiene, en la práctica, privilegios de administrador sobre los datos de negocio, incluida la anulación de facturas emitidas.

### Solución

Definir y documentar la matriz rol × acción en `docs/MATRIZ_PERMISOS.md`:

| Recurso | Acción | admin | manager | user |
|---|---|:--:|:--:|:--:|
| Cotizaciones | listar / ver | ✅ | ✅ | ✅ |
| Cotizaciones | crear / editar | ✅ | ✅ | ✅ |
| Cotizaciones | cambiar estado (emitir/adjudicar/anular) | ✅ | ✅ | ❌ |
| Cotizaciones | eliminar | ✅ | ❌ | ❌ |
| Proyectos | ver / registrar avance y costos | ✅ | ✅ | ✅ |
| Proyectos | crear / asignar recursos | ✅ | ✅ | ❌ |
| Proyectos | eliminar | ✅ | ❌ | ❌ |
| Clientes | crear / editar | ✅ | ✅ | ✅ |
| Clientes | eliminar | ✅ | ❌ | ❌ |
| Facturas | ver | ✅ | ✅ | ✅ |
| Facturas | emitir / cambiar estado | ✅ | ✅ | ❌ |
| Facturas | eliminar | ✅ | ❌ | ❌ |
| Catálogo | crear / editar | ✅ | ✅ | ❌ |
| Catálogo | eliminar | ✅ | ❌ | ❌ |
| Configuración | modificar | ✅ | ❌ | ❌ |

Aplicarla en cada router y exponerla al frontend: el endpoint `/api/auth/me` devuelve el rol; un hook `usePermissions()` oculta o deshabilita las acciones no permitidas.

> La UI **no es** un control de seguridad: es experiencia de usuario. El control real es el backend, y ese es el que se prueba.

### Criterios de aceptación

- [ ] **AC-10.1** — Existe `docs/MATRIZ_PERMISOS.md` y es la referencia única del modelo de permisos.
- [ ] **AC-10.2** — Cada ruta `DELETE` y cada cambio de estado del backend tiene `roleMiddleware` explícito conforme a la matriz.
- [ ] **AC-10.3** — Un token con `role: 'user'` recibe `403` en las 6 rutas listadas en la evidencia.
- [ ] **AC-10.4** — Un token con `role: 'manager'` recibe `403` en los `DELETE` y `200` en los cambios de estado.
- [ ] **AC-10.5** — Un token con `role: 'admin'` conserva acceso completo (sin regresión funcional).
- [ ] **AC-10.6** — La respuesta `403` no revela existencia ni contenido del recurso.
- [ ] **AC-10.7** — El frontend oculta o deshabilita las acciones no permitidas según el rol de la sesión.
- [ ] **AC-10.8** — Existe una **prueba parametrizada** que recorre la matriz completa (rol × endpoint) y verifica el status esperado. Añadir un endpoint sin permisos debe hacerla fallar.

### Verificación

```bash
npm test -- permissions        # AC-10.8, tabla completa rol × ruta
for r in user manager admin; do
  curl -s -o /dev/null -w "$r → %{http_code}\n" -X DELETE $API/api/quotations/$ID \
    -H "authorization: Bearer ${TOKEN[$r]}"
done   # → user 403 / manager 403 / admin 200
```

---

## C-11 · Sin herramienta de migraciones

> **Severidad:** CRÍTICA · **Esfuerzo:** 8 h · **Dominio:** Base de datos

### Evidencia

`backend/src/db/` contiene 4 archivos SQL sueltos (`schema.sql`, `migration_v2_missing.sql`, `migration_v3_project_tasks.sql`, `migration_v4_quote_borrador.sql`). `grep -rn "migration" backend/src --include=*.ts` devuelve **0 coincidencias**: nada en el código los aplica. No hay tabla de control, ni orden garantizado, ni rollback, ni ejecución en el despliegue.

### Riesgo

**No existe forma de saber qué versión de esquema está corriendo en producción.** Los despliegues de código y de esquema están desacoplados: un deploy puede introducir código que consulta una columna que nadie aplicó todavía, y el fallo aparece en runtime frente al usuario. Las migraciones aplicadas a mano no son reproducibles en staging ni en un restore.

### Solución

Adoptar `node-pg-migrate` (SQL plano, curva de aprendizaje mínima, compatible con el esquema actual):

```bash
cd backend && npm i -D node-pg-migrate
```

```jsonc
// package.json
"scripts": {
  "migrate":      "node-pg-migrate -m src/db/migrations",
  "migrate:up":   "npm run migrate -- up",
  "migrate:down": "npm run migrate -- down 1"
}
```

Plan de adopción:

1. Convertir `schema.sql` en la migración base `0001_baseline.sql`.
2. Convertir `migration_v2/v3/v4` en `0002`, `0003`, `0004`, cada una con su `down`.
3. En la base de datos **ya existente**, marcar las 4 como aplicadas sin ejecutarlas (`--fake` / insert manual en `pgmigrations`) tras verificar que el esquema real coincide.
4. Añadir `npm run migrate:up` como paso previo al deploy en el pipeline.
5. Regla operativa: toda migración debe ser **compatible hacia atrás** (expand → migrate → contract), para que el rollback de código no rompa el esquema.
6. Documentar el procedimiento en `docs/MIGRACIONES.md`.

### Criterios de aceptación

- [ ] **AC-11.1** — Existe `backend/src/db/migrations/` con las migraciones numeradas y la tabla de control `pgmigrations` creada.
- [ ] **AC-11.2** — Sobre una base de datos **vacía**, `npm run migrate:up` reproduce el esquema completo: 14 tablas, 24 índices, 2 vistas y los triggers de `updated_at`.
- [ ] **AC-11.3** — El esquema resultante de (2) es **idéntico** al de producción (comparación con `pg_dump --schema-only` diff vacío).
- [ ] **AC-11.4** — Cada migración tiene su `down` y `npm run migrate:down` revierte la última sin errores.
- [ ] **AC-11.5** — El despliegue ejecuta las migraciones automáticamente antes de publicar la nueva versión.
- [ ] **AC-11.6** — Una migración a medias deja la base de datos consistente (cada archivo corre dentro de una transacción).
- [ ] **AC-11.7** — El job de integración de CI (`C-06`) usa las migraciones, no `schema.sql` directo.
- [ ] **AC-11.8** — `docs/MIGRACIONES.md` describe cómo crear, aplicar y revertir, y la regla de compatibilidad hacia atrás.

### Verificación

```bash
docker compose up -d postgres
(cd backend && npm run migrate:up)
pg_dump --schema-only $LOCAL_URL > /tmp/local.sql
pg_dump --schema-only $PROD_URL  > /tmp/prod.sql
diff /tmp/local.sql /tmp/prod.sql     # AC-11.3 → sin diferencias
(cd backend && npm run migrate:down && npm run migrate:up)   # AC-11.4
```

---

## C-12 · Backups no verificados

> **Severidad:** CRÍTICA · **Esfuerzo:** 6 h · **Dominio:** Continuidad

### Evidencia

Neon ofrece PITR según plan, pero es una **capacidad de la plataforma, no una política del proyecto**: no hay respaldo documentado, ni copia fuera del proveedor, ni retención definida, ni una sola restauración probada. Tampoco hay RTO/RPO acordados.

### Riesgo

Un borrado accidental, una migración mal aplicada (ver `C-11`) o la pérdida de acceso a la cuenta de Neon implican **pérdida total e irreversible** de cotizaciones, proyectos y facturas. Un respaldo que nunca se restauró no es un respaldo: es una suposición.

### Solución

1. Acordar con el negocio **RPO = 24 h** y **RTO = 4 h**, y dejarlo escrito.
2. Job diario (GitHub Actions programado o Vercel Cron) con `pg_dump --format=custom` cifrado hacia almacenamiento externo (S3/R2/Backblaze) — **fuera** del proveedor de la base de datos.
3. Retención: 7 diarios + 4 semanales + 12 mensuales.
4. Alerta si el job no reporta éxito en 26 h (un backup que falla en silencio es peor que no tenerlo).
5. Confirmar y documentar el PITR de Neon como segunda capa.
6. **Simulacro de restauración trimestral**: restaurar el último dump en una base limpia, arrancar la app contra ella y validar el login y el listado de cotizaciones. Registrar el tiempo real de recuperación.
7. `docs/DR_RUNBOOK.md`: qué hacer si cae Neon, si cae Vercel o si se corrompen datos; con contactos y pasos numerados.

### Criterios de aceptación

- [ ] **AC-12.1** — El job de respaldo corre diariamente y deja evidencia (log + tamaño + checksum del artefacto).
- [ ] **AC-12.2** — Los respaldos residen en un proveedor **distinto** de Neon y están cifrados en reposo.
- [ ] **AC-12.3** — La política de retención está implementada y el borrado automático funciona.
- [ ] **AC-12.4** — **Se ejecutó al menos una restauración completa**, documentada con fecha, duración y responsable.
- [ ] **AC-12.5** — La aplicación arranca correctamente contra la base restaurada y el login y el listado de cotizaciones funcionan.
- [ ] **AC-12.6** — El tiempo medido de restauración es **≤ RTO (4 h)**; si no, se ajusta el procedimiento o el objetivo.
- [ ] **AC-12.7** — Un fallo del job genera alerta en < 26 h (probado desactivando el job a propósito).
- [ ] **AC-12.8** — Existe `docs/DR_RUNBOOK.md` con RTO/RPO, procedimiento y contactos.
- [ ] **AC-12.9** — El simulacro trimestral está agendado con responsable asignado.

### Verificación

```bash
aws s3 ls s3://$BUCKET/backups/ --recursive | tail -5     # AC-12.1
createdb restore_test && pg_restore -d restore_test /tmp/ultimo.dump
psql restore_test -c 'SELECT count(*) FROM quotations;'   # AC-12.4/12.5
```

---

# Seguimiento

## Definición de "Hecho"

Un hallazgo se considera cerrado cuando:

1. Todos sus criterios de aceptación están marcados y **verificados por una persona distinta** de quien implementó.
2. Existe al menos una **prueba automatizada en CI** que falla si el problema reaparece.
3. El cambio está fusionado en `master` vía PR aprobado, con CI en verde.
4. El comportamiento fue verificado **en producción** (o en staging, cuando exista).

## Tablero de avance

| ID | Hallazgo | Sprint | Estado | Responsable | AC cerrados |
|---|---|---|---|---|---|
| C-01 | Secretos por defecto | 1 | ☐ Pendiente | | 0/7 |
| C-02 | `ALLOW_NO_PIN` | 1 | ☐ Pendiente | | 0/6 |
| C-03 | CORS reflejante | 1 | ☐ Pendiente | | 0/6 |
| C-04 | Hardening y rate limiting | 1 | ☐ Pendiente | | 0/8 |
| C-05 | Credenciales en el repositorio | 1 | ☐ Pendiente | | 0/8 |
| C-06 | Integración continua | 2 | ☐ Pendiente | | 0/8 |
| C-07 | Suite no ejecutable | 2 | ☐ Pendiente | | 0/7 |
| C-08 | Observabilidad | 2 | ☐ Pendiente | | 0/7 |
| C-09 | Vulnerabilidades de terceros | 2 | ☐ Pendiente | | 0/7 |
| C-10 | Autorización por rol | 3 | ☐ Pendiente | | 0/8 |
| C-11 | Migraciones | 3 | ☐ Pendiente | | 0/8 |
| C-12 | Backups verificados | 3 | ☐ Pendiente | | 0/9 |

**Total: 89 criterios de aceptación.**

## Impacto esperado

| Métrica | Antes | Después |
|---|---|---|
| Cumplimiento global | 37% | 65–70% |
| Hallazgos críticos | 12 | 0 |
| Hallazgos de riesgo alto | 20 | ~12 |
| Vulnerabilidades en dependencias | 9 | 0 (o documentadas y mitigadas) |
| Verificaciones automáticas por PR | 0 | 5 (tipos, lint, tests, audit, secretos) |

## Fuera de alcance

Este plan cubre **únicamente los 12 hallazgos críticos**. Los 20 de riesgo alto —validación con `zod`, sesiones revocables, recuperación de contraseña, entorno de staging, code-splitting, pruebas E2E, WAF, correo con SPF/DKIM/DMARC, privacidad y Ley 21.719, entre otros— están detallados en las olas 3 y 4 de `docs/AUDITORIA_QA_2026-07.html` y deben planificarse a continuación.
