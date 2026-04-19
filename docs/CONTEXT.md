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
