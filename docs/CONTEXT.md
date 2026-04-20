# Context — MVP Build Plan

*Structured spec authoring for autonomous development pipelines. Hand-built in VS Code.*

---

## The thesis in one paragraph

RedDwarf's bottleneck is intake quality. Freeform GitHub issues produce vague plans, and vague plans waste operator attention downstream. Context is a small web app that sits in front of RedDwarf (and eventually other pipelines) and turns fuzzy human intent into a structured, canonical specification through a guided conversation. The conversation is a means; the structured spec is the product. As underlying models improve, Context's output quality improves without any rewrite, because the substrate — schema, state machine, UI — is model-agnostic.

---

## What this doc is

A personal build plan. Ten tickets, dependency-ordered, with acceptance criteria terse enough to read at a glance. Not a governance artifact. Deviate from it freely as you learn.

---

## Scope

**In.** A canonical spec schema package. A Fastify backend with Postgres persistence. A React SPA. A conversation engine driven by a deterministic state machine with LLM-assisted phrasing and parsing. Per-user bearer-token auth. Append-only spec history. JSON export. A RedDwarf adapter and injection endpoint to close the loop.

**Out for v0.1.** Contradiction detection. Reference-implementation ingestion. Templates. Real-time collaboration. SSO. Analytics. Multi-modal intake. Schema migration tooling. Integrations with tools other than RedDwarf. Any domain assumption beyond "CRUD-style web applications with a clear domain model."

**Never.** Context does not generate code. The moment it produces snippets it becomes a second planner competing with Holly. One job each.

---

## The schema — v0.1

Defined as Zod in `@context/spec-schema`. TypeScript types generated from Zod. This is the single most important artifact of the project; everything else is UI and plumbing around it.

Top-level blocks:

- **`intent`** — summary, problem, users, non_goals
- **`domain_model`** — entities with fields and relationships
- **`capabilities`** — verbs against entities, each with given/when/then acceptance criteria
- **`flows`** — user-facing sequences with triggers, steps, failure modes
- **`constraints`** — platform, stack, auth, data retention, performance, compliance, deploy posture
- **`references`** — pointers to existing implementations
- **`provenance`** — authorship, completeness per section, unresolved_questions
- **`extensions`** — namespaced consumer-specific fields (e.g. `reddwarf:project_spec`)

Every field has an `importance` annotation that drives question priority in the conversation engine. Every field can be marked `unknown` with a reason — the schema never pretends to be complete when it isn't.

---

## The conversation loop

A deterministic state machine over the spec. The LLM handles language only.

1. Compute completeness by section. Find the highest-priority missing field whose dependencies are met.
2. LLM phrases a natural question about that field, grounded in conversation context.
3. User answers in free text.
4. LLM parses the answer into a structured field update.
5. Zod validates. On failure, re-prompt for clarification.
6. On success, persist to Postgres (append-only history), loop.

The LLM never decides what to ask next. It only phrases and parses. The spec is the system of record, not the conversation. If the LLM produces garbage on turn 12, turn 13 still knows exactly where we are.

---

## Tickets

### T-01 — Spec schema package

Create `@context/spec-schema`. Zod definitions, generated TS types, JSDoc on every field, a `createEmptySpec()` factory, and a `computeCompleteness(spec)` function that returns per-section scores and a prioritised list of missing fields. Thorough tests on validation edges. This package outlives Context and RedDwarf; treat it accordingly.

**Done when:** the package builds, `computeCompleteness` returns sensible output on a handful of fixture specs, and you can import the types cleanly from a scratch consumer.

### T-02 — Backend skeleton + Postgres schema

Create `@context/backend` as a Fastify server. Port 8180 by default. `/health` returns `{ status: 'ok' }` without auth. SQL migration creates `context.specs`, `context.spec_history`, `context.users`, `context.conversation_turns`. Reuse RedDwarf's `REDDWARF_DB_POOL_*` configuration. Structured logging using the same conventions.

**Done when:** `pnpm start` boots the server, the migration applies cleanly, and `/health` responds.

### T-03 — Per-user auth + spec ownership

Bearer-token middleware. `context.users` table stores token hashes, never plaintext. Two roles: editor (can author, modify, share, export) and viewer (read shared specs only). `POST /users` creates a user and returns a one-time plaintext token. `POST /users/:id/rotate-token` for rotation.

**Done when:** two users with different tokens can be distinguished in request handlers, and role checks actually block the right things.

### T-04 — Spec CRUD + append-only history

`POST /specs`, `GET /specs` (owned + shared, with completeness and status), `GET /specs/:id`, `PATCH /specs/:id` (validated partial updates), `GET /specs/:id/history`. Every mutation appends to `context.spec_history` with diff, author, timestamp. Pessimistic editing lock via `POST /specs/:id/lock` with a 5-minute lease; concurrent edits return 409 with lock holder info.

**Done when:** you can round-trip a spec via curl, and the history table shows the correct diffs.

# T-04a — Spec Sharing

You are implementing ticket **T-04a** in the Context MVP build plan. This ticket closes a scope gap: T-04's `GET /specs` returns "owned + shared" and T-03 distinguishes editor/viewer roles, but no endpoint or table exists to create the share relationship itself.

This ticket must land between T-04 and T-05. T-05 onwards does not depend on sharing, so keep the blast radius small.

---

## Context

- **Repo layout:** monorepo with `@context/backend` (Fastify, Postgres), `@context/spec-schema` (Zod), `@context/frontend` (Vite React) — see the MVP build plan for conventions.
- **Auth model (from T-03):** bearer tokens, two global roles — `editor` (author, modify, share, export) and `viewer` (read shared specs only). Token hashes live in `context.users`; plaintext is never stored.
- **Specs model (from T-04):** `context.specs` holds canonical specs with an `owner_id`. Every mutation appends to `context.spec_history`. Pessimistic edit lock via `POST /specs/:id/lock` with a 5-minute lease.
- **What's missing:** the table and endpoints that make `GET /specs` actually return shared rows, and the UI affordance to create a share.

---

## Scope

### In
- Migration for `context.spec_shares`.
- Share CRUD endpoints on the backend.
- Update to `GET /specs` join logic so shared specs appear for the recipient.
- Permission enforcement: share role gates write access on `PATCH /specs/:id` and `POST /specs/:id/lock`.
- UI share modal in the authoring view (T-08 scope extension).

### Out
- Email/handle-based invites. Share by `user_id` only for v0.1 — the owner must know the recipient's id. Invite flows wait until there is a second human in the loop.
- Share links, public specs, org-level sharing.
- Notification of share grants (no email, no in-app toast for the recipient beyond the spec appearing in their list).
- Share history or audit beyond the `granted_at` / `granted_by` columns.

---

## Database

Add to the T-02 migration set as a new migration file (do not edit the T-02 migration in place; this is a follow-on).

```sql
CREATE TABLE context.spec_shares (
  spec_id     UUID      NOT NULL REFERENCES context.specs(id) ON DELETE CASCADE,
  user_id    UUID      NOT NULL REFERENCES context.users(id) ON DELETE CASCADE,
  role        TEXT      NOT NULL CHECK (role IN ('viewer', 'editor')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID      NOT NULL REFERENCES context.users(id),
  PRIMARY KEY (spec_id, user_id)
);

CREATE INDEX spec_shares_user_id_idx ON context.spec_shares(user_id);
```

Notes:
- `ON DELETE CASCADE` on both FKs: when a spec or user is deleted, their share rows disappear. This is correct — a share is not an independent entity.
- Unique `(spec_id, user_id)` via composite PK: a user has at most one share row per spec. Re-sharing updates the role; it does not create a second row.
- `role` here is **per-share**, distinct from the global editor/viewer in `context.users`. A global `viewer` cannot be granted an `editor` share — enforce this check in the handler, not the DB.

---

## Endpoints

All endpoints require a valid bearer token. All return JSON. Follow the existing Fastify handler conventions in `@context/backend`.

### `POST /specs/:id/shares`

**Who:** owner of the spec only. 403 otherwise.

**Body:**
```json
{ "user_id": "uuid", "role": "viewer" | "editor" }
```

**Behaviour:**
- 404 if the spec does not exist.
- 404 if `user_id` does not exist. Do not leak existence via a different error shape.
- 400 if `role` is `editor` but the target user's global role is `viewer`.
- 400 if `user_id` equals the owner's id (you cannot share with yourself).
- Upserts on `(spec_id, user_id)` — re-sharing updates the role and `granted_at`.
- 201 on create, 200 on update. Returns the share row.

### `DELETE /specs/:id/shares/:userId`

**Who:** owner of the spec only.

**Behaviour:**
- 404 if the share does not exist.
- 204 on success.
- If the target user currently holds the edit lock on the spec, release the lock as part of this operation.

### `GET /specs/:id/shares`

**Who:** owner, or any user with an existing share on this spec. Non-owners see the list but cannot modify it.

**Returns:** array of `{ user_id, user_display, role, granted_at, granted_by }`. `user_display` is whatever the user list endpoint already exposes — do not invent a new field shape.

### Update to `GET /specs` (from T-04)

The query currently returns specs where `owner_id = :caller`. Change it to:

```sql
SELECT s.*, ...
FROM context.specs s
LEFT JOIN context.spec_shares sh
  ON sh.spec_id = s.id AND sh.user_id = :caller
WHERE s.owner_id = :caller OR sh.user_id IS NOT NULL
```

Include a computed `access` field on each returned row: `"owner"`, `"editor"`, or `"viewer"`. The frontend needs this to decide whether the spec is editable without making a second call.

### Permission enforcement on existing endpoints

- `PATCH /specs/:id`: allow if caller is owner OR has an `editor` share. Otherwise 403.
- `POST /specs/:id/lock`: same rule as PATCH.
- `GET /specs/:id`: allow if caller is owner OR has any share. Otherwise 404 (not 403 — don't leak existence).
- `GET /specs/:id/history`: same as GET.
- Sharing operations themselves: owner only, as above.

---

## Frontend (extension to T-08)

Add a **Share** action to the three-pane authoring view's header, visible only when the current user is the owner of the loaded spec.

Clicking it opens a modal containing:

1. **Current shares list.** Each row: display name, role dropdown (viewer / editor), remove button. Role changes fire `POST /specs/:id/shares` (upsert). Remove fires `DELETE`.
2. **Add a share.** Single input for user id (uuid) — no autocomplete for v0.1, paste-only. Role selector. Submit calls `POST /specs/:id/shares`. Shows the 400 / 404 error messages inline without clearing the input.
3. **Close button.** No save/cancel — every action is immediate.

For non-owners viewing a shared spec:
- If `access === "viewer"`: every editable field becomes read-only. Show a banner at the top: "Shared with you by {owner_display} — read-only."
- If `access === "editor"`: editing works as normal. Banner reads: "Shared with you by {owner_display}."
- Neither role sees the Share button. Only the owner can re-share.

Update the T-07 spec list to show an "owner" column and a small chip for non-owned rows indicating the access level.

---

## Tests

- Migration applies cleanly and rolls back cleanly.
- `POST /specs/:id/shares` by non-owner returns 403.
- Sharing with a global-viewer user at `editor` role returns 400.
- Re-sharing updates role in place; no duplicate rows.
- `GET /specs` as user B returns a spec owned by user A once B has a share row, and omits it after DELETE.
- `PATCH /specs/:id` as an `editor` share succeeds; as a `viewer` share returns 403.
- `GET /specs/:id` as a user with no share returns 404, not 403.
- Deleting a user cascades share rows; deleting a spec cascades share rows.

---

## Done when

- User A can share a spec with user B via the UI.
- B sees the spec in their list with the correct access chip.
- B can edit iff the share role is `editor`; otherwise the UI is read-only and the backend rejects writes.
- Revocation by A removes the spec from B's list on next load and releases any lock B holds.
- All existing T-04 tests still pass. T-07 and T-08 acceptance criteria still pass with the additions above.

---

## Non-negotiables

- No plaintext tokens in logs, ever.
- No silent role escalation: a global `viewer` never gets write access through a share.
- The share table is not append-only. Unlike `spec_history`, historical share state has no product value for v0.1 — keep it simple.
- `.env.example` does not change; this ticket introduces no new env vars.
- TypeScript strict. Zod-validate every request body.

---

## Out of scope reminders

If you find yourself wanting to add any of the following, **stop and push back** — they are out of scope and should be separate tickets:

- Invite-by-email flows
- Share links / tokenised public access
- Organisation or team entities
- Share expiry
- Notification of share events
- Audit log beyond `granted_at` / `granted_by`


### T-05 — Conversation state machine

Pure backend logic. `nextTurn(specId)` returns `{ targetField, context }` — the highest-priority missing field whose dependencies are satisfied, or `null` if the spec is sufficiently complete. Field priority follows schema `importance` annotations (intent > domain_model > capabilities > flows > constraints > references). Dependency rule: a capability cannot be asked about before at least one entity exists. Every call persists a row in `context.conversation_turns` with the state snapshot. Pure function of spec state plus recorded turns.

**Done when:** given a spec at any point in its lifecycle, the engine selects the next field deterministically and sensibly.

### T-06 — LLM adapters: phrase + parse

`phraseQuestion(targetField, specContext, conversationSoFar): string` — produces a natural question, no markdown, no lists. `parseAnswer(targetField, userText, specContext): FieldUpdate | ClarificationRequest` — returns a structured update or asks for clarification. Both honour `REDDWARF_MODEL_PROVIDER` and use the existing provider keys. If `parseAnswer` produces output that fails Zod, auto-re-prompt with a clarification and don't persist the invalid update. Record token usage and model ID on the conversation_turns row. Per-spec turn cap (`CONTEXT_MAX_TURNS_PER_SPEC`, default 60).

**Done when:** you can sit through a full conversation end-to-end and the questions feel like something a thoughtful colleague would ask.

### T-07 — React SPA scaffold + spec list

Create `@context/frontend` as a Vite React app. Same styling and component patterns as `packages/dashboard`. Port 5174. Token auth via `sessionStorage`. Login screen. Spec list view showing owned + shared specs with completeness bar, status chip, owner, last-edited timestamp. "New spec" action creates a draft and navigates to the authoring view (stubbed until T-08).

**Done when:** you can log in, see your specs, and create new ones.

### T-08 — Three-pane authoring UI

The primary surface. Conversation pane left (40%), structured spec pane centre (40%, always in sync with backend), contextual right pane (20%) showing validation messages and unresolved questions. Responsive fallback to a tabbed layout below 1280px. Conversation turns appear optimistically and reconcile on backend confirmation. Every spec field editable in place with debounced PATCH saves. Per-section completeness indicators update live. "Export JSON" downloads the canonical spec. "Send to RedDwarf" action wired through T-10. Lock contention surfaces as a read-only banner with the holder's name.

**Done when:** you can produce a genuine spec in 45 minutes of conversation that reads back as "yes, that's what I meant."

### T-09 — RedDwarf adapter package

Create `@context/reddwarf-adapter`. Exposes `toProjectSpec(canonicalSpec): { projectSpec, translationNotes }` as a pure function. Reads `extensions['reddwarf:project_spec']` if present; infers defaults otherwise. Canonical capabilities translate to RedDwarf TicketSpecs in dependency order. Anything dropped in translation appears in `translationNotes` with path and reason. Adapter version is pinned to a specific schema major version; mismatches throw at load.

**Done when:** a canonical spec round-trips to a valid RedDwarf ProjectSpec, and the translation notes make silent information loss impossible.

### T-10 — RedDwarf injection endpoint

Add `POST /projects/inject` to RedDwarf's operator API. Accepts `{ projectSpec, spec_provenance: { context_spec_id, context_version, translation_notes } }`. Validates against RedDwarf's existing ProjectSpec Zod schema. Creates the project in `pending_approval` — same state a Project Mode planning run would produce, so the existing approval flow works unchanged. Provenance persists on the ProjectSpec and is visible in the RedDwarf dashboard. Translation notes archive to evidence. Protected by `REDDWARF_OPERATOR_TOKEN`. Idempotent on `(context_spec_id, context_version)` — re-posting returns the existing project rather than creating a duplicate.

**Done when:** a full end-to-end session — Context conversation → export → injection → RedDwarf approval → executed PR — closes cleanly.

---

## Order of work

T-01 first, strictly. Everything depends on it.

T-02 next. Everything after it depends on the DB being there.

After that the dependency graph fans out but since you're one person, just walk them top to bottom: T-03, T-04, T-05, T-06, T-07, T-08. That's the standalone Context app — usable, exports JSON, no RedDwarf integration yet.

Ship it and live with it for a week. Produce three real specs by hand with it. Decide whether the tool earns its keep. If it does, do T-09 and T-10 to close the loop. If it doesn't, the problem is upstream of integration and no amount of RedDwarf wiring will fix it.

---

## Non-negotiables while building

- Every LLM call records token usage and model ID against a persistable row. You'll want the data later.
- `.env.example` gets updated for every new env var, with a comment.
- TypeScript strict across all new packages.
- No new required env var without a default or a startup-time validation that fails loudly.
- The adapter (T-09) stays a pure function with no network calls and no side effects. Violate this and you'll regret it in six months.
- Schema changes after T-01 are deliberate, versioned, and documented. Don't silently evolve the shape while building later tickets.

---

## The single test that matters

> Does Context, after an N-minute conversation, produce a spec meaningfully richer than what you'd write by hand as a GitHub issue in the same N minutes?

If yes — at any N — the thesis holds and the tool earns its keep.

If no, the design is wrong. Pause. More tickets won't fix it. Rethink the conversation loop, the schema priorities, or the UI before building further.

---

## Recursion, eventually

When T-10 lands and the loop closes, the first interesting thing to do is feed this document — or a canonical-schema version of it — into Context, watch the adapter produce a RedDwarf ProjectSpec, and see whether RedDwarf's Project Mode can execute the next version of Context from it. That's not a demo; it's the strongest proof the substrate bet actually works.

For now, build it by hand. Build it well. The better the hand-built version, the more credible the recursion when it comes.
