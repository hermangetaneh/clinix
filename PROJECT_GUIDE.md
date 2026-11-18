# Clinix

Clinix is a healthcare operations workspace for managing patients, clinical teams, appointments, records, billing, and analytics.

## Run & Operate

- Run `pnpm install --frozen-lockfile` once after importing the project.
- `pnpm --filter @workspace/api-server run dev` — run the API server (workflow-managed port, currently 8080)
- `pnpm --filter @workspace/clinix run dev` — run the Clinix web app
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the component preview server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API preview adapter: Express 5
- Standalone deployment backend: Python Flask + SQLAlchemy + SQLite
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/clinix/src` — React/Vite frontend and shared workspace shell
- `artifacts/api-server/src/routes/clinix.ts` — preview API routes and seed data
- `backend/app.py` — standalone Flask + SQLite implementation
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/clinix.ts` — PostgreSQL schema source of truth

## Architecture decisions

- The preview uses the repository's managed Express/Drizzle service so typed React hooks can run inside the workspace; the standalone Flask backend remains available for Python hosting.
- All generated client code is derived from the OpenAPI document; frontend screens do not hand-write fetch contracts.
- The preview database is PostgreSQL with fictional seed data, while the independent Flask deployment defaults to SQLite.
- Session cookies are used for the demo auth flow; passwords are hashed with scrypt in the preview adapter and Werkzeug's secure password helper in Flask.

## Product

Clinix provides a public landing page, auth flows, dashboard, patients, doctors, appointments, medical records, billing, analytics, notifications, search, settings, dark mode, and mobile navigation.

## User preferences

- The interface should feel calm, precise, trustworthy, modern, and memorable without looking like a generic generated dashboard.

## Gotchas

- The web Vite config requires workflow-provided `PORT` and `BASE_PATH`; use the managed workflow for preview builds.
- Run API codegen after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
