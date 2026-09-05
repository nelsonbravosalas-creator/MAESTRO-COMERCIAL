# Configuración de correo transaccional — BravoCRM

**Estado (2026-09-05): código listo para SMTP con Gmail, faltan las variables
de entorno en Vercel.** El diagnóstico de por qué el reset de contraseña no
llegaba a nadie confirmó `RESEND_API_KEY`/`MAIL_FROM` sin definir → caía a
`NoopMailer`. Se agregó soporte SMTP (ver "Opción B" más abajo) como salida
rápida sin depender de un dominio propio verificado, pero falta que alguien
con acceso al dashboard de Vercel cargue `SMTP_USER`/`SMTP_PASSWORD` en
Production y redepliegue — hasta entonces sigue sin enviar nada de verdad.

El código (`backend/src/services/mailer.ts`) soporta dos proveedores:
`SMTP_USER`/`SMTP_PASSWORD` (prioridad) o `RESEND_API_KEY`/`MAIL_FROM`. Sin
ninguno de los dos, cae a un `NoopMailer` que solo registra un log — nadie
recibe nada, aunque la API responda 202 igual (por diseño, para no filtrar
qué correos existen).

## Opción B (recomendada ahora) — SMTP con una cuenta de Gmail existente

Para cuando no hay un dominio propio verificado todavía. Envía a través del
SMTP de una cuenta de Gmail ya existente, autenticado con una **contraseña de
aplicación** (nunca la contraseña real de la cuenta).

1. En la cuenta de Gmail que va a enviar (ej. `documentos.nbyb@gmail.com`):
   activar verificación en dos pasos (myaccount.google.com/security).
2. Generar una contraseña de aplicación: myaccount.google.com/apppasswords
   → nombre "BravoCRM" → copiar el código de 16 caracteres.
3. Variables de entorno del backend (`backend/.env.example` ya las documenta):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=documentos.nbyb@gmail.com
   SMTP_PASSWORD=<contraseña de aplicación de 16 caracteres, sin espacios>
   ```
   `MAIL_FROM` es opcional en este modo — si no se define, se usa `SMTP_USER`
   como remitente.
4. En Vercel: Project Settings → Environment Variables → cargar las 4
   variables de arriba en `Production` (y `Preview` si corresponde) → forzar
   un redeploy para que la función tome los valores nuevos.

**Límites:** ~500 correos/día (cuenta Gmail normal), remitente
`documentos.nbyb@gmail.com` en vez de un dominio propio. Suficiente para el
volumen de resets de contraseña de un CRM interno; migrar a la Opción A
(Resend + dominio propio) si el volumen crece o se necesita una marca propia
en el remitente.

## Opción A — Resend con dominio propio

Alternativa más profesional a largo plazo, pero requiere tener (o comprar) un
dominio propio y acceso a su DNS.

### Por qué Resend

Integración nativa con Vercel, plan gratuito suficiente para el volumen actual,
y la configuración de dominio (SPF/DKIM/DMARC) se hace desde su propio panel
sin tocar registros a mano uno por uno.

### Pasos (requieren acceso al proveedor de DNS del dominio)

1. Crear cuenta en [resend.com](https://resend.com) y agregar el dominio.
2. Resend entrega 3 registros DNS a publicar:

   | Registro | Tipo            | Propósito                                        |
   | -------- | --------------- | ------------------------------------------------ |
   | SPF      | TXT en `@`      | autoriza a Resend a enviar en nombre del dominio |
   | DKIM     | TXT/CNAME       | firma criptográfica de cada correo               |
   | DMARC    | TXT en `_dmarc` | qué hacer con correo que falla SPF/DKIM          |

3. Empezar DMARC en `p=none` una semana (solo recolecta reportes, no rechaza
   nada) y subir a `p=quarantine` después de confirmar que los correos propios
   pasan.
4. Verificar en el panel de Resend que el dominio quedó "Verified".
5. Variables de entorno del backend (`backend/.env.example` ya las documenta):
   ```
   RESEND_API_KEY=re_...
   MAIL_FROM="BravoCRM <no-reply@tudominio.cl>"
   ```
6. Prueba real: enviar un correo a `check-auth@verifier.port25.com` y
   confirmar `spf=pass dkim=pass dmarc=pass` en el reporte que responde.

## Qué queda bloqueado sin esto

- `A-04` (recuperación de contraseña): el código está implementado
  (`POST /api/auth/forgot-password`), pero sin correo real el usuario nunca
  recibe el enlace. Con `NoopMailer`, el flujo solo es verificable leyendo los
  logs del backend (el token queda ahí en modo desarrollo, nunca en el correo).
- Notificar cotizaciones/facturas por correo a los clientes: no implementado
  todavía, tampoco depende de código adicional una vez que el mailer real
  esté activo (reutiliza `services/mailer.ts`).

## Verificación una vez configurado

**Opción B (SMTP/Gmail):** con las 4 variables cargadas en Vercel y
redeployado, usar `POST /api/auth/forgot-password` con un correo real y
revisar la bandeja de destino (y spam). Si no llega, revisar Runtime Logs del
deployment en Vercel buscando `Mailer: fallo SMTP al enviar` — ahí queda el
motivo exacto (credenciales inválidas, verificación en dos pasos no activada,
etc.).

**Opción A (Resend/dominio propio):**

```bash
dig +short TXT tudominio.cl | grep spf1
dig +short TXT _dmarc.tudominio.cl
```
