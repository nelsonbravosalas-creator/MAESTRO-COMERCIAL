# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).
Este proyecto no seguía versionado semántico antes de esta entrada — arranca aquí.

## [Unreleased]

### Seguridad

- Validación de entrada con zod en todas las rutas de escritura (A-01).
- Sesiones revocables: refresh tokens hasheados, rotación con detección de
  reuso, `logout`/`logout-all` (A-02).
- Recuperación y cambio de contraseña, con política mínima de 8 caracteres
  reemplazando el PIN de 4 dígitos (A-03, A-04).
- Validación de certificado TLS activa hacia la base de datos —
  `rejectUnauthorized: true` (A-05).
- PII (correos) enmascarada en logs de aplicación (A-05).
- Secretos, credenciales reales y bypasses de autenticación eliminados del
  repositorio (`ALLOW_NO_PIN`, usuarios hardcodeados, PIN por defecto en
  README/scripts) — remediación de hallazgos críticos.
- Rate limiting en login, admin/setup y forgot-password; bloqueo de cuenta
  tras intentos fallidos repetidos.
- RBAC aplicado a operaciones destructivas y cambios de estado (C-10).

### Infraestructura y CI

- `node-pg-migrate` reemplaza los scripts SQL sueltos; el esquema es
  reproducible desde cero (C-11).
- Pipeline de CI: tipos, lint, tests con cobertura, `npm audit`, escaneo de
  secretos y build de la función serverless (C-06, A-12).
- `backend/tsconfig.json` corregido: solo compilaba `server-dev.ts`, el resto
  del backend nunca se construía con `npm run build` (bug preexistente).
- commitlint + husky: mensajes de commit siguen Conventional Commits.
- Documentación reorganizada bajo `docs/`; `.xlsx` de origen removidos del
  árbol (los datos ya viven en `frontend/src/data/cityDistances.ts`).

### Corregido

- Dependencias con vulnerabilidades conocidas actualizadas o eliminadas por no
  usarse (`bcrypt` nativo, `uuid`, `xlsx`, `react-router` desactualizado).
- `docker-compose.yml` y scripts locales ya no traen contraseñas por defecto.

[Unreleased]: https://github.com/OWNER/REPO/compare/master...HEAD
