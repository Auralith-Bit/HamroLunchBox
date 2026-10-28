# Hamro Lunch Box

Restaurant ordering and operations app arranged as a small full-stack monorepo. The frontend is React + Vite, the API is Express, and PostgreSQL schema/configuration live in `database/` and `backend/`.

## Project structure

```text
frontend/                 React application and Vite configuration
  src/                    Pages, components, and shared UI constants
  nginx.conf              Reverse proxy used by the production image
backend/                  Express API
  src/config/              PostgreSQL connection pool
  src/routes/              API route handlers
database/                  PostgreSQL schema and future migrations
```

## Setup

### Docker (full stack)

Copy the example environment file, set strong passwords, and start everything:

```powershell
copy .env.docker.example .env
docker compose up -d --build
```

Open `http://localhost:8080` (change the port with `APP_PORT`). Compose creates PostgreSQL, applies `database/schema.sql` on first start, builds the API and the nginx-served frontend, and wires them together on an internal network. Only the frontend publishes a host port.

### Local development

Install workspace dependencies from the project root:

```powershell
npm install
```

Create the local PostgreSQL database and apply `database/schema.sql`, then copy `backend/.env.example` to `backend/.env` and set the local database credentials (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`) plus the first `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAME`. Start the API and frontend in separate terminals:

```powershell
npm run dev:backend
npm run dev
```

The API listens on `http://localhost:3000`; `GET /api/health` checks the PostgreSQL connection and returns 503 when the database is unreachable. The frontend runs on Vite's usual `http://localhost:5173` address and proxies `/api` to the API, so the browser only ever talks to one origin. Production frontend builds use `npm run build` and produce `frontend/dist`.

## Data and auth behavior

The frontend is fully connected to the API: it loads state from `GET /api/business` and autosaves with `PUT /api/business`. All business data lives in the PostgreSQL `business_state` table as a single JSON document guarded by a `revision` counter (concurrent saves get `409 Conflict` and must reload). Nothing is stored in browser local storage, so clearing browser data does not remove saved records; use the in-app backup export instead.

Authentication is cookie based (`hlb_session`, `HttpOnly`, `SameSite=Strict`, 12-hour lifetime) against the `users` and `sessions` tables, with scrypt password hashing. Roles are enforced server side: `reception` cannot manage accounts, and `delivery` can only read its own orders and change their status or payments.

The API has no CORS middleware by design — it is meant to be reached through the Vite dev proxy or the nginx reverse proxy on the same origin.

## Menu and orders

Admin and reception users can open **Menu** from the prominent button near the top of the sidebar. Add menu items, assign them to **Lunch menu**, **Daily nasta**, or **Others**, and set each item's price in rupees. Ingredient usage per box can also be linked to inventory items.

When creating a customer bill, choose a customer and menu items with quantities. The app uses saved menu prices to calculate line amounts, subtotal, discount, VAT when enabled, total, payments, and balance due. The customer and calculated total are saved with the order and shown on its invoice.

## Accounts

There are no seeded or demo logins. The first administrator is created at API startup from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (minimum 12 characters) in the environment. Every other account is created by an administrator in **Login accounts**, with a temporary password handed over out of band. Admins can change their own password there by entering the current password and choosing a new passphrase of at least 12 characters. The environment password is only used to create the first administrator; changing it does not reset an existing account.

| Role | Access |
|---|---|
| Admin | Everything, including account management |
| Reception | Orders, billing, inventory, reports; no account management |
| Delivery | Only orders assigned to that driver |

## Deployment notes

`docker compose` is the supported deployment path and serves frontend and API from one origin. `vercel.json` produces a static frontend build only: its rewrite sends every path to `index.html` and there is no `/api` route, so a static-only host will render the UI but every API call will fail unless you add a rewrite from `/api/*` to a separately hosted backend. When serving the API behind HTTPS, set `COOKIE_SECURE=true` so session cookies carry the `Secure` flag.

### Railway

Railway deploys each Compose service separately. For both the `backend` and `frontend` services, connect this repository, leave **Root Directory** at `/` (the repository root), and set the Dockerfile path under **Build** to `backend/Dockerfile` or `frontend/Dockerfile` respectively. Both Dockerfiles use root-relative `COPY` paths and require the repository root as their build context; setting the root directory to `/backend` or `/frontend` will break the build. Add a Railway PostgreSQL service and run `database/schema.sql` against it once before starting the API.

Set the backend's `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` using the PostgreSQL service's private connection variables. Also set `ADMIN_USERNAME`, a unique `ADMIN_PASSWORD` of at least 12 characters, `ADMIN_NAME`, and `COOKIE_SECURE=true`. Name the API service `backend`. On the frontend service, set `BACKEND_HOST=backend.railway.internal`, then generate a public domain for the frontend on port 80. The frontend Docker image defaults `BACKEND_HOST` to `backend` for Docker Compose; its Nginx template substitutes the Railway value at container startup.

Switching from MySQL does not transfer existing data. Back up/export your current business data before deploying and import or enter it in the new PostgreSQL instance; do not delete the old database until that has been verified.

VAT is optional and disabled by default. The app does not connect to IRD/CBMS and is not presented as IRD-listed e-billing software.
