## Qué cambia y por qué

<!-- Una o dos frases. El "por qué" importa más que el "qué" — el diff ya muestra el qué. -->

## Cómo se probó

- [ ] `npm test` pasa en los paquetes que tocaste (backend/frontend)
- [ ] Probado manualmente en local (describir el flujo si aplica)
- [ ] Si tocaste el esquema de base de datos: hay una migración en `backend/src/db/migrations/`

## Checklist de seguridad

- [ ] No hay secretos, tokens ni credenciales en el diff
- [ ] Las rutas nuevas que escriben datos (`POST`/`PUT`/`PATCH`) validan el body con zod
- [ ] Las rutas nuevas que requieren un rol específico usan `roleMiddleware`
- [ ] No se agregó ningún `rejectUnauthorized: false` ni bypass de autenticación

## Impacto en requisitos no funcionales

<!-- Ver docs/RNF_Y_SLOS.md. Si este cambio no afecta ninguno, decir "Ninguno". -->

- [ ] Rendimiento (latencia, tamaño de bundle, N+1 queries)
- [ ] Disponibilidad / manejo de errores
- [ ] Ninguno
