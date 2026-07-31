# Despliegue — BravoCRM

**Estado actual:** Vercel despliega automáticamente cada push a `master` vía
su integración nativa con GitHub (no hay un job de GitHub Actions que llame a
`vercel deploy` — es Vercel el que escucha el repo directamente). Este
documento describe el estado actual y lo que falta para el flujo con gates
completo del plan de remediación (`A-09`).

## Flujo actual

```
push a master → CI corre (quality, secrets, integration, vercel-function)
              → Vercel despliega EN PARALELO, no espera a que CI termine
```

**Esto es el gap principal de A-09**: el deploy de Vercel no está condicionado
a que CI pase. Un PR puede fusionarse con CI en rojo (si alguien hace
`--admin` merge) y Vercel lo despliega igual.

## Cómo cerrarlo (requiere el dashboard de Vercel)

1. **Project Settings → Git → Ignored Build Step** en Vercel: configurar para
   que el build se salte si no hay un commit status/check exitoso — Vercel
   soporta condicionar el build a checks de GitHub en algunos planes.
2. Alternativa más simple y 100% verificable: **branch protection** en GitHub
   (`Settings → Branches → master`) exigiendo los checks `quality (backend)`,
   `quality (frontend)`, `secrets`, `integration` antes de poder mergear un
   PR. Con eso, nada llega a `master` sin que CI haya pasado — y como Vercel
   despliega `master`, el gate queda cerrado igual, sin depender de
   configuración especial de Vercel.
3. **Migraciones antes del deploy**: hoy no hay ningún paso automático que
   corra `npm run migrate:up` contra producción antes de que el código nuevo
   la use. Mientras no se resuelva, la disciplina es manual: correr
   `npm run migrate:up` con el `DATABASE_URL` de producción **antes** de
   mergear cualquier PR que dependa de un cambio de esquema.

## Smoke test post-deploy

`scripts/smoke.sh <url>` — comprobaciones mínimas (health check con DB real,
login rechaza credenciales inválidas sin 500, el frontend sirve la SPA). No se
ejecuta automáticamente todavía; no hay forma de engancharlo a un deploy de
Vercel sin un webhook o una GitHub Action que dispare después del deploy
(Vercel expone un webhook de "deployment succeeded" que podría llamar a un
workflow — no configurado, requiere acceso al dashboard).

Uso manual después de cada deploy a producción:

```bash
./scripts/smoke.sh https://tu-dominio.vercel.app
```

## Rollback

**Código:** `vercel rollback` (CLI) o desde el dashboard → Deployments →
elegir el deployment anterior → "Promote to Production". Es inmediato.

**Esquema de base de datos:** la regla de `docs/MIGRACIONES.md` (expand →
migrate → contract) existe exactamente para que un rollback de código nunca
deje el esquema en un estado que la versión anterior no entienda. Si una
migración específica necesita revertirse: `npm run migrate:down` — probado
localmente, no en un simulacro real contra producción.

## Procedimiento de emergencia (resumen)

1. Confirmar el problema con `scripts/smoke.sh` o `docs/INCIDENT_RUNBOOK.md`.
2. Si es un problema de código: `vercel rollback` al deployment anterior conocido bueno.
3. Si es un problema de datos: ver `docs/DR_RUNBOOK.md`.
4. Documentar qué pasó después — este archivo y el runbook solo sirven si se
   actualizan con lo que realmente se aprendió.

## Pendiente para cumplir A-09 completo

- [ ] Branch protection en GitHub exigiendo los 4 checks de CI.
- [ ] Migraciones automatizadas como paso previo al deploy (no manual).
- [ ] Smoke test disparado automáticamente post-deploy (webhook de Vercel → GitHub Action).
- [ ] Un rollback simulado end-to-end, con tiempo medido (< 5 min según el plan).
- [ ] `Deployment` de Sentry marcado con el SHA del commit como `release` (el código ya soporta `VERCEL_GIT_COMMIT_SHA`, falta confirmarlo en un deploy real).
