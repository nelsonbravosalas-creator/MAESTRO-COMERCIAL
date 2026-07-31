# Runbook de incidentes — BravoCRM

**Actualizado:** 2026-07-30. Revisar cuando cambie el proveedor de hosting, DB o el
responsable técnico.

## 1. ¿Algo está roto? Primero mira esto

1. `GET /api/health` — si responde `503`, la base de datos no es alcanzable (ver
   sección 3). Si no responde en absoluto, la función serverless está caída (ver
   sección 4 — Vercel).
2. Panel de Vercel → proyecto → **Deployments** → build/runtime logs del último deploy.
3. Panel de Vercel → **Logs** en tiempo real (o `Log Drains` si está configurado un
   destino externo — los logs de funciones serverless son efímeros).
4. Si Sentry está configurado (`SENTRY_DSN` / `VITE_SENTRY_DSN`): panel de Sentry →
   últimos eventos, agrupar por `release` para ver si empezó con el último deploy.
5. Cualquier log relevante trae `requestId` — pídele ese valor al usuario que reporta
   el problema (viene en la respuesta de error y en la cabecera `x-request-id`) para
   encontrar exactamente esa petición en los logs.

## 2. A quién avisar

| Rol | Contacto | Cuándo |
|---|---|---|
| Responsable técnico | Nelson Bravo (dueño del repo) | Cualquier caída en producción |

*(Completar con el contacto real del equipo/soporte antes de operar con usuarios reales.)*

## 3. La base de datos no responde (`/api/health` → 503)

- Confirmar en el panel de Neon si el proyecto está activo (los proyectos free-tier
  se "duermen" tras inactividad y tardan unos segundos en despertar — un 503 aislado
  seguido de recuperación sola puede ser esto, no una caída real).
- Revisar el límite de conexiones del plan de Neon: el pool del backend usa `max: 5`;
  si hay múltiples instancias de función serverless activas a la vez, pueden agotar
  el límite de conexiones directas. Ver `docs/MIGRACIONES.md` / issue abierto sobre
  usar el endpoint *pooled* (pgbouncer) de Neon.
- Si Neon está caído: no hay mitigación desde la app. Comunicar el estado a los
  usuarios y monitorear el status page del proveedor.

## 4. Vercel no sirve la app o las funciones fallan

- Revisar si el último deploy a `master` pasó CI (`.github/workflows/ci.yml`). Un
  deploy con errores de build se queda en el deploy anterior automáticamente en
  Vercel, pero conviene confirmarlo en el panel.
- **Rollback:** panel de Vercel → Deployments → elegir el deployment estable anterior
  → "Promote to Production". Es inmediato y no requiere revertir en git.
- Si el rollback en Vercel no es suficiente (el problema viene de datos, no de código):
  ver `docs/DR_RUNBOOK.md` para restauración de base de datos.

## 5. Login masivo fallando (posible bloqueo por rate limit)

- `POST /api/auth/login` limita a 5 intentos / 15 min por combinación IP+email
  (`backend/src/config/rateLimiters.ts`). Si un usuario legítimo quedó bloqueado,
  no hay panel de desbloqueo manual todavía: esperar la ventana o reiniciar la
  función (en serverless, el estado del limiter vive en memoria del proceso y no
  persiste entre invocaciones frías, así que un cold start ya lo despeja).
- Tras 10 intentos fallidos la CUENTA (no la IP) queda bloqueada 30 min
  (`failed_login_attempts` / `locked_until` en `users`). Desbloqueo manual:
  ```sql
  UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = '<email>';
  ```

## 6. Reportar un error nuevo no cubierto aquí

Después de resolverlo, añadir una sección a este archivo con: síntoma, causa raíz,
y el fix o mitigación aplicada. Este documento solo es útil si se actualiza.
