# Infraestructura, perímetro y red — BravoCRM

**Estado: sin configurar.** Esto requiere acceso a los dashboards de Vercel y
Neon que esta sesión no tiene. Queda documentado como checklist de lo que
falta activar y por qué.

## A-06: WAF / protección perimetral (Vercel)

1. **Vercel Firewall** (plan Pro o superior): agregar reglas de rate limit en
   el borde para:
   - `/api/auth/login` — más agresivo que el rate limit de aplicación
     (`C-04`), porque este actúa **antes** de invocar la función serverless
     (evita el costo de invocación de un ataque volumétrico, no solo el
     riesgo de fuerza bruta).
   - `/api/admin/setup` — igual de crítico, ya está limitado en aplicación
     pero conviene la doble capa.
2. **Challenge para tráfico automatizado** (bot detection) en las mismas rutas.
3. **Alertas de picos anómalos** — Vercel expone métricas de tráfico; configurar
   una alerta si el tráfico horario supera ~10x la línea base.

Verificación una vez activado: 200 peticiones en 10s contra `/api/auth/login`
desde una IP de prueba deben bloquearse en el panel de Vercel **sin generar
invocaciones de función** (visible en la pestaña de Functions vs. Firewall).

## A-06: restricción de red en Neon

1. Activar **IP Allowlist** o el equivalente de acceso restringido al proyecto
   (depende del plan de Neon contratado).
2. **Rotar `DATABASE_URL`** inmediatamente después de aplicar la restricción
   (la cadena de conexión actual quedó potencialmente expuesta en el
   historial de git de este mismo proyecto — ver el plan de críticos, C-05).
3. Actualizar el secret en Vercel (todas las variables de entorno) y en
   GitHub Actions (`PROD_DATABASE_URL` para `backup.yml` y
   `cleanup-sessions.yml`).

## A-07 (relacionado): un solo entrypoint de servidor

Ya resuelto en la remediación de críticos (`C-06`/`C-07` de la sesión
anterior): `backend/src/app.ts` es la única definición de la aplicación,
`server.ts` solo hace `app.listen()`, y `api/index.ts` reexporta `app` sin
lógica propia. Ver `docs/adr/0001-entrypoint-unico.md`.

## Bloqueo de geografía

No implementado — decisión de negocio pendiente (¿la operación es exclusiva
de Chile?). Si aplica, se configura junto con las reglas de Vercel Firewall
del punto 1.

## Checklist de verificación (llenar cuando se active cada cosa)

- [ ] Regla de rate limit de borde para `/api/auth/login` — probada
- [ ] Regla de rate limit de borde para `/api/admin/setup` — probada
- [ ] Alerta de tráfico anómalo configurada
- [ ] IP allowlist de Neon activa
- [ ] `DATABASE_URL` rotado después de restringir el acceso
- [ ] Secrets actualizados en Vercel y GitHub Actions
