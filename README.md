# Context

> Structured spec authoring for autonomous development pipelines.

Context sits in front of [RedDwarf](https://github.com/derekrivers/RedDwarf) and turns fuzzy human intent into a canonical, structured specification through a guided conversation. The conversation is a means; the structured spec is the product. Because the schema, state machine, and UI are model-agnostic, Context's output quality improves as underlying models improve — no rewrite required.

This repo is a solo-developer MVP. Not multi-tenant, not production-hardened, not a hosted service. You run it on your own laptop against your own bearer tokens.

---

## What's here

```
packages/
├── spec-schema/          Canonical Zod schema + completeness scoring
├── backend/              Fastify API, Postgres persistence, LLM adapters
├── frontend/             Vite + React SPA (login, spec list, three-pane authoring)
└── reddwarf-adapter/     Pure translator from canonical spec → RedDwarf ProjectSpec
```

Build plan and ticket history live in [docs/CONTEXT.md](docs/CONTEXT.md).

---

## Requirements

- **Node.js** ≥ 22
- **pnpm** ≥ 10 (`corepack enable` picks up the pinned version)
- **Docker** + **Docker Compose** (for the local Postgres container)
- An **Anthropic API key** — required for the conversation engine (phrase + parse calls).

---

## Quick start

```bash
# 1. Install
pnpm install

# 2. Start Postgres (foreground or detached; see docker-compose.yml)
docker compose up -d

# 3. Build all packages
pnpm build

# 4. Apply DB migrations (creates the `context` schema)
CONTEXT_PG_PASSWORD=context \
CONTEXT_ADMIN_TOKEN=$(openssl rand -hex 24) \
ANTHROPIC_API_KEY=sk-ant-… \
pnpm --filter @context/backend db:migrate

# 5. Start the backend (port 8180) in one terminal
cp .env.example .env   # edit values — see "Environment variables" below
pnpm --filter @context/backend start

# 6. Start the frontend dev server (port 5174) in a second terminal
pnpm --filter @context/frontend dev

# 7. Create your first user + bearer token
ADMIN_TOKEN=<value-you-set-in-.env>
curl -X POST http://127.0.0.1:8180/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","role":"editor"}'
# Response includes a `token` — copy it.

# 8. Visit http://127.0.0.1:5174, paste the token, sign in.
```

The dev proxy sends the frontend's `/api/*` requests to the backend on port 8180, so no CORS config is needed.

---

## Environment variables

All backend + frontend env vars live in the root `.env.example`. Copy it to `.env` and fill values in. Key ones:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CONTEXT_PG_PASSWORD` | yes | — | Matches `docker-compose.yml` for local dev (`context`). |
| `CONTEXT_ADMIN_TOKEN` | yes | — | ≥ 16 chars. Used for `POST /users` (user provisioning). |
| `ANTHROPIC_API_KEY` | yes | — | Needed for every LLM call; the backend won't boot without one. |
| `CONTEXT_PHRASE_MODEL` | no | `claude-haiku-4-5-20251001` | Model for question-phrasing calls. |
| `CONTEXT_PARSE_MODEL` | no | `claude-sonnet-4-6` | Model for answer-parsing calls. Tool-use reliability matters here. |
| `CONTEXT_MAX_TURNS_PER_SPEC` | no | `60` | Hard cap per spec; surfaces as a terminal UI card. |
| `CONTEXT_MAX_TOKENS_PER_SPEC` | no | `500000` | Hard cap per spec, summed across turns. |
| `CONTEXT_LLM_TIMEOUT_MS` | no | `30000` | Per-call timeout. |
| `CONTEXT_FRONTEND_PORT` | no | `5174` | Vite dev server port. |
| `CONTEXT_BACKEND_URL` | no | `http://127.0.0.1:8180` | Used by the frontend's dev proxy. |
| `VITE_CONTEXT_SEND_TO_REDDWARF_ENABLED` | no | `false` | Toggles the "Send to RedDwarf" button. |

See [`.env.example`](.env.example) for the full list with inline comments.

---

## Scripts

All runnable from the repo root:

| Command | What it does |
|---|---|
| `pnpm build` | Type-checks + compiles every workspace package (backend, schema, adapter) and builds the frontend. |
| `pnpm test` | Runs the full Vitest workspace: backend integration tests (Postgres-backed), spec-schema unit tests, reddwarf-adapter tests, and frontend jsdom tests. Expect ~280+ tests. |
| `pnpm --filter @context/backend db:migrate` | Apply any pending SQL migrations from `packages/backend/drizzle/`. |
| `pnpm --filter @context/backend db:generate` | Generate a new migration from schema changes (requires interactive TTY). |
| `pnpm --filter @context/backend start` | Boot the Fastify server on port 8180. |
| `pnpm --filter @context/backend dev` | Same, with `--watch` and source maps. |
| `pnpm --filter @context/backend test:live` | Runs the live LLM tests. Requires `ANTHROPIC_API_KEY` and will spend real tokens. |
| `pnpm --filter @context/frontend dev` | Vite dev server on port 5174, with HMR. |
| `pnpm --filter @context/frontend build` | Production build (emits `packages/frontend/dist/`). |
| `pnpm --filter @context/frontend preview` | Serves the production build locally for sanity-checking. |

Integration tests skip when Postgres is unreachable; live LLM tests skip when `RUN_LIVE_LLM_TESTS` is not set.

---

## HTTP API surface

All endpoints require `Authorization: Bearer <token>` except `POST /users` (which requires the admin token) and `GET /health`.

**Users**
- `POST /users` — create a user; returns a one-time plaintext token.
- `POST /users/:id/rotate-token` — rotate a user's token (admin or self).
- `GET /users/me` — whoami.

**Specs**
- `POST /specs` (editor) — create a draft spec.
- `GET /specs` — list specs the caller owns or has a share on.
- `GET /specs/:id` — fetch one; owners + share-holders.
- `PATCH /specs/:id` — validated partial update; requires caller holds the edit lock.
- `GET /specs/:id/history` — append-only spec history.
- `POST /specs/:id/lock` — acquire a 5-minute edit lease.
- `GET /specs/:id/lock` / `DELETE /specs/:id/lock` — state + early release.

**Sharing** (T-04a)
- `POST /specs/:id/shares` / `DELETE /specs/:id/shares/:userId` / `GET /specs/:id/shares` — owner-managed share rows (`viewer` or `editor`).

**Conversation** (T-05 / T-06)
- `POST /specs/:id/turns/next` — deterministic state-machine pick of the next target field.
- `POST /specs/:id/turns/:turnId/phrase` — LLM phrases a question for a selection turn.
- `POST /specs/:id/turns/answer` — LLM parses a free-text answer into a field update / clarification / skip / unknown.
- `POST /specs/:id/turns/:turnId/skip` / `POST /specs/:id/turns/unskip` — manual skip and retry.
- `GET /specs/:id/turns` — full turn history.

**Context / unresolved** (T-08c)
- `GET /specs/:id/unresolved` — fields the state machine has given up on or the user has marked unanswerable.
- `POST /specs/:id/fields/retry` — re-queue a stuck field.

All request/response shapes are Zod-validated at the boundary.

---

## Architecture cheat sheet

- **Canonical spec** lives as JSON on `context.specs.spec_json`, validated by the Zod schema in `packages/spec-schema`. Every mutation appends to `context.spec_history`. A monotonic `version` column on `specs` is the idempotency key for external consumers (notably RedDwarf).
- **Conversation engine** (`packages/backend/src/conversation/`) owns the deterministic "what field to ask about next" logic. The LLM only phrases questions and parses answers; it never decides what to ask.
- **State machine turns** persist to `context.conversation_turns`. Every LLM call records its tokens and model id against a turn row.
- **Pessimistic editing lock** on every spec: 5-minute lease, renewed every 2 min while the tab is visible, released on unmount + `beforeunload`. Human edits go through the lock; LLM-driven answer turns bypass it.
- **RedDwarf adapter** (`packages/reddwarf-adapter`) is a pure function: canonical spec in, RedDwarf `ProjectSpec` + translation notes out. No network, no DB, no LLM. The vendored target schema is SHA-256 pinned to a specific RedDwarf commit; drift fails at module load.
- **Frontend** is Vite + React + TanStack (Query + Router) + Tailwind + shadcn primitives. No global state store.

---

## Sending a spec to RedDwarf (T-09 / T-10)

Once a spec is ready, Context can post it to a live RedDwarf instance.

1. Make sure RedDwarf is running with `REDDWARF_PROJECTS_INJECT_ENABLED=true` (default) and you have its operator token.
2. Flip the feature flag in Context's frontend: `VITE_CONTEXT_SEND_TO_REDDWARF_ENABLED=true`.
3. On the spec page, set `extensions['reddwarf:project_spec'].sourceRepo` to `owner/repo`.
4. Click **Send to RedDwarf**. The adapter translates locally; the payload posts to RedDwarf's `POST /projects/inject`.
5. The project lands in RedDwarf's `pending_approval` queue — same state a Project Mode planning run would produce. Approve it through the existing operator UI and the pipeline runs normally.

Idempotency: re-sending the same `(context_spec_id, context_version)` returns RedDwarf's existing project rather than creating a duplicate. Bump the Context version (any substantive PATCH does this) to deliberately re-inject.

---

## Security notes

- Bearer tokens are stored hashed (`sha256` of the plaintext) in `context.users.token_hash`. The plaintext is returned exactly once at creation / rotation time.
- The frontend stores its token in `sessionStorage`, so closing the tab ends the session.
- Admin-token requests (`POST /users` and bootstrap helpers) don't map to a user identity. Don't use the admin token for anything beyond user provisioning.
- `.env` is in `.gitignore`; `.env.example` is not a secret.

---

## Contributing

The build plan in [docs/CONTEXT.md](docs/CONTEXT.md) is the current source of truth. Tickets landed so far: T-01 through T-08c, T-09. Work in progress or follow-ups are flagged in each ticket's PR description.

Before opening a PR:

```bash
pnpm build
pnpm test
```

Both should pass cleanly.
