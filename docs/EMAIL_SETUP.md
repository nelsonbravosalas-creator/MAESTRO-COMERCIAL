# Configuración de correo transaccional — BravoCRM

**Estado: no configurado.** El código (`backend/src/services/mailer.ts`) ya
soporta enviar correo vía Resend, pero sin `RESEND_API_KEY` cae a un
`NoopMailer` que solo registra un log — nadie recibe nada. Esto requiere que
alguien con acceso al DNS del dominio complete los pasos de abajo.

## Por qué Resend

Integración nativa con Vercel, plan gratuito suficiente para el volumen actual,
y la configuración de dominio (SPF/DKIM/DMARC) se hace desde su propio panel
sin tocar registros a mano uno por uno.

## Pasos (requieren acceso al proveedor de DNS del dominio)

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

```bash
dig +short TXT tudominio.cl | grep spf1
dig +short TXT _dmarc.tudominio.cl
```
