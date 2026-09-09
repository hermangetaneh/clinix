# Clinix

Clinix is a premium hospital management workspace for clinic administrators. It brings patient records, clinical team operations, appointments, medical records, billing, notifications, and analytics into one calm, precise interface.

## What is included

- Public Clinix landing experience with responsive marketing copy
- Session-based login and registration with securely hashed passwords
- Dashboard with real database totals, appointment status, activity, and trends
- Patient and doctor CRUD with search, filtering, profiles, and related records
- Appointment scheduling with availability conflict protection and status updates
- Medical record timeline with patient and doctor associations
- Invoice management with payment status and revenue summaries
- Analytics with range filters, department performance, and status breakdowns
- Global search, notifications, dark mode, settings, mobile navigation, empty/loading/error states
- Typed OpenAPI contract and generated React Query client
- Standalone Flask + SQLite backend under `backend/` for separate Python deployment

## Demo account

Use this fictional portfolio account in the local demo:

- Email: `demo@clinix.health`
- Password: `clinixdemo`

These credentials are seeded by the development API and are not production credentials.

## Architecture

```text
React + Vite frontend
        ↓
Typed REST client generated from lib/api-spec/openapi.yaml
        ↓
Preview adapter: artifacts/api-server (Express + Drizzle)
        ↓
PostgreSQL database
```

The product brief also requires a Python deployment path. `backend/app.py` is a separate Flask application using SQLAlchemy and SQLite by default, with the same core domain models and API routes.

## Run locally in Replit

The managed workflows start the web app and API server:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/clinix run dev
```

The workspace uses the pre-provisioned PostgreSQL database for the preview adapter. The schema is defined in `lib/db/src/schema/clinix.ts`.

## Run the Flask backend separately

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
flask --app app init-db
flask --app app run
```

Set `SECRET_KEY`, `DATABASE_URL`, and `CORS_ORIGINS` using `backend/.env.example`. Never commit real credentials or patient data.

## API contract and checks

The source of truth for the client and backend contract is `lib/api-spec/openapi.yaml`.

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
python -m py_compile backend/app.py
```

All sample records are fictional portfolio data. Clinix is a demonstration application, not a clinical system for real patient data.