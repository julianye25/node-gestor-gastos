# AGENTS.md

## Overview

- Local-only, multi-user expense tracker for up to `MAX_USERS` accounts (default 4). The server binds to `127.0.0.1`; there is no deployment target and no Vercel/Render/serverless files. Do not add them unless the user explicitly changes this decision.
- UI and API error messages are in **Spanish**; keep new user-facing strings in Spanish.
- Vanilla frontend + `node:http`; **no build step**. The only runtime dependency is `mongodb`. Do not add Express/React/Vite or other frameworks unless the user explicitly asks.
- Each account has a private expense list. Auth is username/password + a signed `HttpOnly` cookie; registration requires an invite code.

## Commands

- Node is pinned to 26.13.1 in `.node-version`; run `fnm use` first if the shell is not on v26.
- `.env` is required locally and must define at least `MONGODB_URI` and `SESSION_SECRET`. Copy `.env.example` and adjust it.
- `npm start` → http://127.0.0.1:3000 (localhost only).
- `npm run dev` → same server with `node --watch src/server.js`.
- `npm test` → all test files with `node --test`.
- Single test file: `node --test test/app.test.js`
- Single test case: `node --test --test-name-pattern="login correcto" test/app.test.js`
- Syntax check: `npm run check` (`src/app.js` + `public/app.js`).
- Account admin: `npm run user -- list | add <usuario> | passwd <usuario> | delete <usuario>`. `add`/`passwd` prompt for the password.

## Architecture

- `src/server.js` — local entrypoint. Loads `.env` with `process.loadEnvFile()`, validates config, serves static files from `public/`, delegates `/api/*` to `src/app.js`, adds security headers, and closes the Mongo client on `SIGINT`/`SIGTERM`. Do not add API routes here.
- `src/app.js` — `createApp({ expenses, users, config })`: API router and auth flow (register, login, logout, `/api/me`, `/api/meta`, expenses CRUD, summary, export, health). Parses JSON bodies (1 MB limit), checks `Origin` on mutating requests, and maps errors to JSON `{ error }`.
- `src/domain.js` — categories, limits, validation (`toCents`, dates, months, usernames, passwords, `validateExpense`) and error classes carrying `statusCode`.
- `src/mongo.js` — `createMongoRepositories({ uri, dbName, expensesCollection, usersCollection })`; returns `{ expenses, users, close }`, creates indexes, and caches one `MongoClient` promise per URI.
- `src/users.js` — `scrypt` password hashing/verification and `publicUser` (never expose `passwordHash`).
- `src/auth.js` — cookie parsing, HMAC session signing/verification, cookie headers.
- `src/config.js` — environment validation and defaults; throws on invalid values.
- `src/summary.js` — pure `summarize(expenses, { month })`.
- `public/` — vanilla HTML/CSS/ES modules, no bundler: `index.html` + `app.js` (main UI), `login.html` + `login.js`, `register.html` + `register.js`, `styles.css`, `favicon.svg`.
- `scripts/user.js` — CLI to list/create/delete accounts and reset passwords.
- `test/` — domain, auth, API (in-memory repositories) and summary tests; `test/mongo.test.js` runs only when `MONGODB_URI_TEST` is set.
- `test-support/` — `memory.js` (in-memory repositories) and `server.js` (real API on a random port for tests).
- `data/expenses.json` — **legacy** data from the single-user file-store version. The current app does not read it. Never delete or reset it; migrate only on explicit request.

## Data model (MongoDB)

- Database `MONGODB_DB` (default `gestor_gastos`); collections `users` and `expenses` (names configurable via env).
- `users`: `{ _id, username, usernameLower, passwordHash, createdAt }`; unique index on `usernameLower`.
- `expenses`: `{ _id, ownerId, amountCents, category, date, description, createdAt, updatedAt }`.
- Indexes: `{ ownerId: 1, date: -1, createdAt: -1 }` and `{ ownerId: 1, category: 1, date: -1 }`.
- `ownerId` is always derived from the session user; never accept it from the client.
- Every read/update/delete filters by `ownerId`. A foreign expense id must return `404`, not `403`.
- Runtime data lives in MongoDB. Tests must use `test-support/memory.js` or a disposable `MONGODB_URI_TEST` database; never the real database.

## Money and dates

- Persist money as integer **cents** in `amountCents`; never store floats. `toCents` accepts numbers or strings like `"12,50"` / `"12.50"` and rounds.
- Default currency is **COP**, displayed with 0 decimals; other currencies use 2. For another zero-decimal currency, add it to `ZERO_DECIMAL_CURRENCIES` in `public/app.js`.
- COP input accepts whole pesos with optional thousand dots (`25000`, `25.000`); decimals are rejected client-side. Server cap is `MAX_AMOUNT_CENTS` in `src/domain.js`.
- Categories are fixed in `CATEGORIES` (`src/domain.js`); the frontend loads them from `GET /api/meta`.
- Months use `YYYY-MM`; dates use `YYYY-MM-DD`.

## Auth and security

- Passwords: `scrypt` (N=16384, r=8, p=1, 64-byte key, 16-byte random salt, `maxmem` 64 MB) with `timingSafeEqual`; stored as `scrypt$N$r$p$salt$hash`. Usernames are 3–20 chars (`[\p{L}\p{N}._-]`); passwords 8–128 chars.
- Cookie `gg_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=SESSION_DAYS`; `Secure` only when `COOKIE_SECURE=1` (local HTTP).
- `SESSION_SECRET` must be at least 32 characters; rotating it invalidates all sessions.
- Registration: requires `REGISTRATION_CODE`; if empty, registration is closed (`403`). `MAX_USERS` (default 4) caps accounts. Duplicate username (case-insensitive) → `409`; wrong invite code → `403`.
- Login always returns `401` with "Usuario o contraseña incorrectos"; it verifies against a dummy hash for unknown users so timing does not reveal existence.
- Mutating requests with an `Origin` header must match the `Host` (CSRF hardening); requests without `Origin` are allowed. JSON bodies are limited to 1 MB (`413`).
- No rate limiting, email verification, password reset by email, or session revocation on password change. Use `npm run user -- passwd` to reset a password.

## API

Public:
- `GET /api/health` → `{ ok: true }`
- `POST /api/register` → `201 { user }` + session cookie; body `{ inviteCode, username, password }`
- `POST /api/login` → `{ user }` + session cookie; body `{ username, password }`
- `POST /api/logout` → `204`, clears the cookie

Session required:
- `GET /api/me` → `{ user }`
- `GET /api/meta` → `{ categories, currency }`
- `GET /api/expenses?month=YYYY-MM&category=...` → `{ expenses }`
- `POST /api/expenses` → `201 { expense }`
- `GET|PUT|PATCH|DELETE /api/expenses/:id` → `{ expense }` / `{ ok: true }`
- `GET /api/summary?month=YYYY-MM` → totals and breakdowns
- `GET /api/export` → JSON attachment with the user's expenses

Errors are JSON `{ error }`: `400` validation, `401` no session/bad login, `403` closed registration/bad invite/bad origin, `404` not found, `409` duplicate user, `413` body too large, `503` database unavailable. Unknown `/api/*` → JSON 404; missing static files → plain-text 404. `README.md` must be updated whenever routes, env vars, or defaults change.

## Frontend/CSS

- Cyberpunk theme tokens live at the top of `public/styles.css` (`--bg`, `--cyan`, `--magenta`, `--font-mono`). Category neon colors are duplicated in `CATEGORY_COLORS` (`public/app.js`) and applied inline.
- Keep `[hidden] { display: none !important; }` in the CSS: author `display` rules (e.g. `.btn`) otherwise override the `hidden` attribute used by the cancel button, toast, and empty state.
- `public/app.js` redirects to `/login.html` on `401`, shows the current user, handles logout, and downloads `/api/export`.
- Login/register pages redirect to `/` if a session already exists.
- Static responses use `Cache-Control: no-cache`; login/register pages use `no-store`. Hard-reload if style/JS changes do not appear.
- All new UI text must be Spanish.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `MONGODB_URI` | — (required) | `mongodb+srv://...` (Atlas) or `mongodb://127.0.0.1:27017/gestor_gastos` (local) |
| `MONGODB_DB` | `gestor_gastos` | |
| `MONGODB_USERS_COLLECTION` | `users` | |
| `MONGODB_EXPENSES_COLLECTION` | `expenses` | |
| `SESSION_SECRET` | — (required, ≥32 chars) | Generate with `openssl rand -hex 32` |
| `SESSION_DAYS` | `30` | |
| `REGISTRATION_CODE` | empty (registration closed) | Share only with the 4 users |
| `MAX_USERS` | `4` | |
| `CURRENCY` | `COP` | 3-letter ISO code |
| `HOST` | `127.0.0.1` | Keep local-only |
| `PORT` | `3000` | |
| `COOKIE_SECURE` | unset | Set `1` only if serving over HTTPS |

- `.env` contains secrets and is gitignored (`.env`, `.env.*`, except `.env.example`). Never commit it.
- Atlas free tier pauses after inactivity and has no reliable backups; use `GET /api/export` and document manual backups.
- Never print `.env` values, `MONGODB_URI`, or password hashes in logs or responses.

## Tests

- `npm test` runs domain, auth, API and summary tests; `test/mongo.test.js` is skipped unless `MONGODB_URI_TEST` is defined.
- API tests use `startTestServer()` from `test-support/server.js`, which mounts the real `createApp` on a random port over in-memory repositories.
- Required coverage when adding features: validation, password hashing/session cookies, registration/login/logout, API behavior, ownership isolation (A cannot read/edit/delete B), summary/export scoping, and filters.
- MongoDB integration: `MONGODB_URI_TEST='mongodb://127.0.0.1:27017' npm test`. It creates a random database and drops it at the end. Never point tests at the real `MONGODB_URI`.
- There is no frontend test runner; use `npm run check` and manual checks.

## Known gaps / possible follow-ups

- Optional migration of `data/expenses.json` into a specific account.
- Optional rate limiting for login/register.
- Optional password-change endpoint with session revocation.
- Do not add Vercel/Render/serverless files unless the user explicitly changes the local-only decision.
