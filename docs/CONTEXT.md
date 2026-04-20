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


# T-05 — Conversation State Machine

You are implementing ticket **T-05** in the Context MVP build plan. This ticket is the heart of the conversation loop: the deterministic logic that decides what the LLM should ask next. The LLM does not make this decision — it only phrases the question (T-06) and parses the answer (T-06). This ticket owns "what to ask."

This ticket depends on T-01 (schema), T-02 (DB), T-03 (auth), T-04 (spec CRUD). It does not depend on T-04a (sharing) or anything later.

---

## Context

- **Schema (from T-01):** `@context/spec-schema` exports Zod types, `createEmptySpec()`, and `computeCompleteness(spec)`. Every field carries an `importance` annotation. Fields can be marked `unknown` with a reason.
- **DB (from T-02):** `context.specs`, `context.spec_history`, `context.conversation_turns` tables exist.
- **Next consumer (T-06):** `phraseQuestion(targetField, specContext, conversationSoFar)` will consume what this ticket returns. The shape of `targetField` and `context` is a contract with T-06.

---

## Architectural split: pure selector + impure recorder

The original ticket wording said "pure function … persists a row." Those are incompatible. Split them:

### `selectNextField(spec, turns): Selection | null` — **pure**

- No DB, no IO, no clock, no randomness.
- Takes the full spec and the ordered list of prior turns for that spec as inputs.
- Returns a `Selection` object or `null`.
- Lives in `@context/backend/src/conversation/selector.ts`.
- Exhaustively unit-testable against fixtures.

### `nextTurn(specId): Promise<Selection | null>` — impure wrapper

- Loads spec from `context.specs`.
- Loads turns from `context.conversation_turns` for this spec, ordered by `turn_index` ascending.
- Calls `selectNextField`.
- Persists a new row in `context.conversation_turns` capturing what was selected (see **Turn recording** below).
- Returns the same `Selection` to the caller.
- Lives in `@context/backend/src/conversation/engine.ts`.

The HTTP layer calls `nextTurn`. T-06 (`phraseQuestion`) receives the `Selection` from the HTTP layer, not by importing the selector. Keep the boundary clean.

---

## Return type

```ts
type Selection = {
  targetField: FieldRef;
  context: SelectionContext;
  reason: SelectionReason;
};

type FieldRef = {
  path: string;         // JSONPath-ish dotted path, e.g. "domain_model.entities[0].fields[2].type"
  section: Section;     // "intent" | "domain_model" | "capabilities" | "flows" | "constraints" | "references"
  schemaRef: string;    // reference into the Zod schema registry so T-06 can recover field metadata
  importance: Importance; // "critical" | "high" | "medium" | "low"
};

type SelectionContext = {
  // Everything T-06 needs to phrase a good question without re-reading the spec.
  surroundingSpec: unknown;   // the parent object of targetField, for context
  relatedFields: FieldRef[];  // siblings or referenced fields that inform phrasing
  recentTurns: TurnSummary[]; // last 3 turns, for conversational continuity
};

type SelectionReason =
  | { kind: "highest_priority_unblocked" }
  | { kind: "retry_after_clarification"; previousTurnId: string }
  | { kind: "user_unskipped"; previousSkipTurnId: string };

type TurnSummary = {
  turnId: string;
  targetPath: string;
  outcome: "answered" | "clarification_requested" | "skipped" | "unparseable";
};
```

If the spec is complete enough to stop (see **Completeness threshold**), `nextTurn` returns `null` and the HTTP layer responds with 200 and an empty body, or 204 — pick one and be consistent.

---

## Selection algorithm

Given `spec` and `turns`, compute the next selection as follows:

1. **Build the candidate set.** Walk the spec schema and enumerate every field that is currently "missing." A field is missing iff:
   - It is absent or null in the spec, **OR**
   - It is present but explicitly marked `unknown` AND `turns` contains no prior turn where this exact path was answered with an `unknown` acknowledgement.
   
   In other words: a user saying "I don't know, and here's why" satisfies the field for this session. A field that is just structurally empty does not.

2. **Filter by dependencies.** Drop candidates whose dependencies are unmet. See **Dependency rules** below.

3. **Filter by recent activity.** Drop candidates where the most recent turn on this exact path had outcome `skipped` within the last 5 turns. The user explicitly said "not now"; respect it for a window. After 5 turns, the field becomes eligible again.

4. **Filter by retry budget.** Drop candidates where this path has been asked 3+ times with `unparseable` or `clarification_requested` outcomes. The engine has given up on this field; it surfaces in `unresolved_questions` (handled by T-08), not here.

5. **Handle retry priority.** If the most recent turn was a `clarification_requested` outcome for some path, and that path is still in the candidate set after steps 2–4, return it immediately with `reason: "retry_after_clarification"`. The conversation stays focused until the clarification resolves or the retry budget is exhausted.

6. **Handle unskip.** If any turn has outcome `skipped` and the user has since issued an "unskip" turn for that path (recorded as `outcome: "unskipped"` — see **Skip and unskip** below), prioritise that path with `reason: "user_unskipped"`.

7. **Rank remaining candidates.** Sort by:
   - Section priority: `intent` > `domain_model` > `capabilities` > `flows` > `constraints` > `references`. (These map 1→6.)
   - Within section, by field `importance`: `critical` > `high` > `medium` > `low`.
   - Tie-breaker: schema declaration order. Two fields of equal section and importance resolve by whichever appears first in the Zod schema traversal. This is deterministic because Zod's `shape` iteration order is stable.

8. **Return the top candidate** wrapped in a `Selection` with `reason: "highest_priority_unblocked"`.

9. **If the candidate set is empty after all filters,** evaluate the completeness threshold. If met, return `null`. If not met, return the highest-importance field that was dropped by the retry budget filter — the conversation is stuck, and the HTTP response should surface this so the UI can prompt the user to resolve it manually. Include `reason: "retry_after_clarification"` with the latest previous turn id.

---

## Dependency rules

Encode these as a declarative table in `@context/backend/src/conversation/dependencies.ts`. Do not scatter the rules through the selector.

- `capabilities.*` depends on `domain_model.entities` having at least one entry.
- `capabilities[i].acceptance_criteria` depends on `capabilities[i]` having a name and verb.
- `flows.*` depends on `capabilities` having at least one entry with a name.
- `flows[i].steps[j]` depends on `flows[i]` having a trigger.
- `domain_model.entities[i].relationships` depends on `domain_model.entities` having at least two entries.
- `constraints.*` has no dependencies — a user can specify constraints at any time.
- `references.*` has no dependencies.
- `intent.*` has no dependencies — it is always eligible and always highest priority when missing.

No other dependencies for v0.1. If during implementation you feel you need another rule, stop and flag it rather than adding it silently.

---

## Completeness threshold

Use `computeCompleteness(spec)` from T-01. `selectNextField` returns `null` when **all** of the following are true:

- `intent` section score ≥ 0.95
- `domain_model` section score ≥ 0.80
- `capabilities` section score ≥ 0.80
- `flows` section score ≥ 0.60
- `constraints` section score ≥ 0.60
- `references` section score ≥ 0.20

These are starting thresholds. Expose them as named constants in `selector.ts` — do not hardcode numbers in the algorithm body. They will be tuned based on real-spec feedback and need to be easy to adjust.

Rationale to preserve in a comment: intent and domain model must be nearly complete because everything downstream depends on them; flows and constraints can be thinner because they are often naturally incomplete at spec time; references is optional for most specs.

---

## Turn recording

Every call to `nextTurn` persists a row in `context.conversation_turns` with these columns (augment the T-02 migration with any missing columns as a follow-on migration — do not edit T-02's migration in place):

- `id` (uuid pk)
- `spec_id` (uuid fk)
- `turn_index` (int, per-spec monotonic, 0-based)
- `created_at` (timestamptz)
- `phase` (text: `"selection"` | `"answer"` | `"clarification"` | `"skip"` | `"unskip"`)
- `target_path` (text, nullable — null when `phase = null` i.e. spec complete)
- `target_section` (text, nullable)
- `selection_reason` (jsonb, nullable — serialised `SelectionReason`)
- `spec_snapshot` (jsonb — full spec at time of selection)
- `completeness_snapshot` (jsonb — output of `computeCompleteness`)
- `outcome` (text, nullable — populated when an answer turn resolves a prior selection turn)
- `llm_model_id` (text, nullable — populated by T-06)
- `llm_tokens_in` (int, nullable)
- `llm_tokens_out` (int, nullable)

`nextTurn` creates a `phase: "selection"` row. T-06's answer handling creates `phase: "answer"` rows and back-fills the `outcome` on the matching selection row by `spec_id + target_path` pair.

Recording turns must not fail silently. If the insert fails, the whole `nextTurn` call fails with a 500 — better to fail loudly than return a selection that nothing knows about.

---

## Skip and unskip

These are first-class behaviours of the conversation, not edge cases. The user needs a "skip this question" affordance in the UI (T-08 will wire it), and the engine needs to respect it.

- **Skip.** The HTTP layer exposes `POST /specs/:id/turns/:turnId/skip`. This records a `phase: "skip"` turn with `outcome: "skipped"` against the target path. Next `nextTurn` call filters this path out per step 3 above.
- **Unskip.** `POST /specs/:id/turns/skip` with `{ path: string }` in the body (or delete the skip — pick one shape). Records a `phase: "unskip"` turn. Next `nextTurn` call promotes this path per step 6.

Skip and unskip are not in the selector's return path — the selector only reads their effects via `turns`. But the HTTP routes belong to this ticket since they exist to feed the state machine.

---

## HTTP surface

Add to `@context/backend`:

- `POST /specs/:id/turns/next` — calls `nextTurn(specId)`. Returns the `Selection` or 204 if null. Auth: caller must be owner or have an `editor` share (once T-04a lands; until then, owner only).
- `POST /specs/:id/turns/:turnId/skip` — records a skip turn.
- `POST /specs/:id/turns/unskip` — records an unskip turn for a given path.
- `GET /specs/:id/turns` — returns the turn history for debugging and for T-08's right pane.

All endpoints are JSON, bearer-token authed, and follow existing Fastify handler conventions.

---

## Tests

Unit tests for the pure selector are the primary defence. They should live in `@context/backend/src/conversation/selector.test.ts` and cover:

- Empty spec → returns `intent.summary` (highest priority, no dependencies).
- Intent filled, domain model empty → returns `domain_model.entities`.
- Domain model has one entity, no capabilities → next target is a capability field, not a relationship (needs 2+ entities).
- Domain model has two entities → relationship fields become eligible.
- Field marked `unknown` with a reason after a prior turn → not re-selected.
- Field marked `unknown` with no prior turn → still selected (treated as missing).
- Skipped field within 5-turn window → filtered out.
- Skipped field after 5+ turns → eligible again.
- 3 unparseable turns on same path → field drops out, not re-asked.
- All sections above threshold → returns `null`.
- All sections above threshold except `references` at 0.15 → returns `null` (references threshold is 0.20, but section-by-section — verify the precise logic you implement here matches the stated thresholds).
- Deterministic tie-breaking: two fixtures with identical importance fields resolve in schema order, reproducibly across runs.

Integration tests for `nextTurn` cover:

- Turn row is persisted with correct snapshot.
- Failed DB write surfaces as 500, not a silent success.
- `turn_index` is monotonic per spec.
- Skip → next → unskip → next sequence behaves as specified.

---

## Done when

- `selectNextField` is pure, fully unit-tested, and passes all fixtures above.
- `nextTurn` persists turns correctly and is covered by integration tests.
- `POST /specs/:id/turns/next` returns sensible selections on a hand-built fixture spec walked through 10+ turns.
- Skip and unskip behave as specified.
- Given any spec state, running `nextTurn` twice in succession with no intervening spec mutation returns the same `targetField` (determinism check).
- The full traversal from empty spec → threshold-met takes somewhere in the region of 25–50 turns on a realistic CRUD-app fixture. If it takes 200, the thresholds or the candidate set generation are wrong.

---

## Non-negotiables

- The selector is pure. No DB imports. No `Date.now()`. No `Math.random()`. If you need the current time, it is an explicit parameter.
- Thresholds are named constants, not literals in conditionals.
- Dependency rules live in a declarative table, not scattered through branching code.
- Every turn records a spec snapshot. Storage is cheap; debugging a selection that went wrong three turns ago without the snapshot is not.
- TypeScript strict. Zod-validate request bodies on all new HTTP routes.
- No new env vars.

---

## Out of scope

Flag and push back if asked to add any of these:

- LLM-driven selection ("let the model decide what to ask next"). The whole point of this ticket is that the model doesn't decide.
- Contradiction detection (explicit v0.1 non-goal).
- Branching conversation trees based on user persona.
- Multi-spec context (asking questions informed by other specs the user has authored).
- Resuming a conversation in a different order than the selector dictates — if the user wants to fill fields out of order, they edit the spec pane directly (T-08), which is a different code path entirely.

---

## Decisions deferred to you during implementation

Flag these in the PR description so I can sanity-check:

- Whether `nextTurn` returning "no selection but spec not complete" (step 9) is a 200 with a structured body or a distinct status code. Pick one and be consistent.
- Exact shape of `SelectionContext.surroundingSpec` — how much of the parent do you include? Default to the immediate parent object; if T-06 needs more, it can ask for it.
- Whether skip/unskip endpoints live under `/turns/` or `/fields/`. I used `/turns/` above but `/fields/` might read better. Your call.

# T-06 — LLM Adapters: phrase + parse

You are implementing ticket **T-06** in the Context MVP build plan. This ticket introduces the two LLM-backed functions that sit on top of the T-05 state machine: one that phrases a question about a target field, and one that parses a user's free-text answer into a structured field update. The LLM does no planning — that's T-05's job. The LLM handles language only.

This ticket depends on T-01 (schema), T-02 (DB), T-03 (auth), T-04 (spec CRUD), T-05 (state machine and turn recording). It does not depend on T-04a or anything later.

---

## Context — RedDwarf conventions

Before writing any code, read these files from the RedDwarf repo:

- `.env.example` — canonical env key order. `ANTHROPIC_API_KEY` is already present. Any new env var you add goes here first, in the existing `REDDWARF_*` style, with a comment.
- `CLAUDE.md` and `AGENTS.md` in the repo root.
- `packages/contracts` — domain schemas and types. Zod conventions.
- `packages/control-plane` — existing orchestration patterns. Look for how Anthropic is called today for the planning agent. Reuse the same client wrapper if one exists; if there's only ad-hoc usage, this ticket will introduce the first proper wrapper.
- `packages/evidence` — persistence patterns. Reuse the `pg.Pool` that's already configured via `REDDWARF_DB_POOL_*`.

**Important correction to the original ticket wording.** The original T-06 referenced `REDDWARF_MODEL_PROVIDER`. That env var does not exist. RedDwarf is Anthropic-only in v1 — only `ANTHROPIC_API_KEY` is defined in `.env.example`. Do not introduce a provider abstraction layer in this ticket. Use the Anthropic SDK directly via a thin wrapper. If a provider layer is ever needed later, it's a separate refactor.

---

## Architectural split

Two pure(ish) functions, one thin client module.

### `@context/backend/src/llm/client.ts`

A minimal wrapper around `@anthropic-ai/sdk`. Exposes a single `callModel({ system, messages, tools?, model, maxTokens }): Promise<ModelResponse>` function. Handles:

- API key loading from `ANTHROPIC_API_KEY`.
- Timeout (30 seconds default, from `CONTEXT_LLM_TIMEOUT_MS`).
- Retries on 429 and 5xx: max 3 attempts, exponential backoff starting at 500ms.
- Returns `{ content, tokensIn, tokensOut, modelId, stopReason }`. Do not leak SDK types beyond this module.

No streaming in v0.1. The conversation UI is not realtime-dependent; wait for the full response.

### `@context/backend/src/conversation/phrase.ts`

```ts
phraseQuestion(
  selection: Selection,   // from T-05
  turnsForSpec: TurnRecord[],
): Promise<PhraseResult>
```

Returns `{ text, tokensIn, tokensOut, modelId }`. The `text` is a single sentence, no markdown, no bullet points, no preamble like "Great question!" The function itself enforces none of that — the system prompt does.

### `@context/backend/src/conversation/parse.ts`

```ts
parseAnswer(
  selection: Selection,
  userText: string,
  spec: CanonicalSpec,
  turnsForSpec: TurnRecord[],
): Promise<ParseResult>
```

Returns a discriminated union:

```ts
type ParseResult =
  | { kind: "update"; updates: FieldUpdate[]; tokensIn: number; tokensOut: number; modelId: string }
  | { kind: "clarification"; question: string; reason: ClarificationReason; tokensIn: number; tokensOut: number; modelId: string }
  | { kind: "skip"; tokensIn: number; tokensOut: number; modelId: string }
  | { kind: "unknown"; reason: string; tokensIn: number; tokensOut: number; modelId: string };

type FieldUpdate = {
  path: string;       // must be writable per the schema
  value: unknown;     // must validate against the field's Zod schema
  confidence: "high" | "medium" | "low";
};

type ClarificationReason =
  | "ambiguous"
  | "multiple_interpretations"
  | "contradicts_existing_spec"
  | "insufficient_detail";
```

Four outcomes, not two. The original "update or clarification" framing loses information:

- **`update`** — parseable into one or more field updates.
- **`clarification`** — the model needs more info to parse confidently. The returned `question` is phrased as a follow-up the UI can show directly.
- **`skip`** — the user said "skip" / "not now" / "I'll come back to this." This is not an error, it's a first-class outcome. T-05 handles it via the skip endpoint.
- **`unknown`** — the user said "I don't know" (or equivalent) and provided a reason. Writes the field as `{ unknown: true, reason: "..." }` per the T-01 schema.

---

## Structured output strategy

Use **Anthropic tool use / function calling** for `parseAnswer`. Not JSON mode, not free-text-then-regex.

- Define a tool called `record_answer` with four input variants matching the four `ParseResult` kinds. The model selects one.
- For `update`, the tool's input schema includes the set of fields the model is allowed to write. Derive this at call time from `selection.targetField` plus any co-located fields in the same object (so the user answering "admins and customers" about a single `users` field can legitimately produce one update, but can't drift into writing `constraints.auth`).
- On tool-use response, validate the tool input against Zod. If it fails, retry the call **once** with an appended `tool_result` block describing the validation failure. If the retry also fails, return `{ kind: "clarification", reason: "insufficient_detail", question: "<generated follow-up>" }`.
- Never persist an invalid update. The `parseAnswer` function does not write to the database at all; it returns a structured result, and T-08's answer-handling code writes on success.

For `phraseQuestion`, no tool use — it's a free-text call. The system prompt enforces constraints (single sentence, no markdown, conversational, colleague tone).

---

## Models

Two models, two env vars:

- `CONTEXT_PHRASE_MODEL` (default: `claude-haiku-4-5-20251001`) — phrase calls are cheap, high-volume, conversational. Haiku is plenty.
- `CONTEXT_PARSE_MODEL` (default: `claude-sonnet-4-6`) — parse calls are where reliability matters. A user typing "yeah just admins for now" needs to become `{ path: "intent.users", value: ["admin"], confidence: "medium" }` without drama. Use a stronger model.

Both values come from env, validated at startup, fail loudly if absent or malformed.

Add to `.env.example` (in canonical order, with comments):

```
# -- Context LLM configuration -------------------------------------------------
CONTEXT_PHRASE_MODEL=claude-haiku-4-5-20251001
CONTEXT_PARSE_MODEL=claude-sonnet-4-6
CONTEXT_LLM_TIMEOUT_MS=30000
CONTEXT_MAX_TURNS_PER_SPEC=60
CONTEXT_MAX_TOKENS_PER_SPEC=500000
```

---

## System prompts

Both prompts live in `@context/backend/src/conversation/prompts/` as `.md` files and are loaded at startup. Don't inline long prompts into TypeScript — they'll be iterated on, and diffs are easier to read as markdown.

### `phrase.md` — tone guidance

Write it to produce questions that feel like a thoughtful colleague is asking, not a form. Key constraints to include:

- One sentence. Occasionally two if the field genuinely needs setup context.
- No markdown, no bullet lists, no numbered lists, no bold, no headers.
- No preamble ("Great question!", "Sure thing!", "Let me ask about...").
- No meta-commentary ("Now I need to understand...", "The next thing to figure out...").
- Reference the existing spec naturally when it helps — "You mentioned the app is for small clinics — roughly how many users per clinic?" — rather than asking in a vacuum.
- Don't ask compound questions. One field, one question.
- Tone: curious, concise, respectful of the user's time. Think "senior engineer interviewing a PM," not "chatbot."

Include 3–5 good/bad pairs in the prompt as few-shot examples. I'll draft those in a follow-up if you want — for v0.1, start with examples drawn from a CRUD-app spec: asking about entity fields, acceptance criteria, non-goals.

### `parse.md` — extraction guidance

Key constraints:

- The `record_answer` tool must be called. No free-text replies.
- Preserve ambiguity. If the user said "a few admins and some customers," the confidence is `medium`, not `high`. Don't round up.
- Detect skip intent broadly — "skip", "not now", "later", "no idea, move on" — and map to `{ kind: "skip" }`.
- Detect unknown intent — "I don't know", "not sure yet", "TBD" — and map to `{ kind: "unknown" }` with a reason. If the user provides no reason, ask for one via `clarification`.
- When the user answers multiple adjacent fields in one turn, produce multiple updates. Scope is limited to fields within the same parent object as `selection.targetField`.
- If the user's answer contradicts something already in the spec (e.g., previously said "single-tenant," now says "multi-tenant"), return `{ kind: "clarification", reason: "contradicts_existing_spec" }` and surface the conflict in the follow-up question. Do not silently overwrite.

---

## Conversation history shape

`turnsForSpec` is the full ordered list of turns for the spec. Do not send all of them to the LLM on every call — that blows token budgets fast.

For `phraseQuestion`:

- Include the last 6 turns verbatim (selection + answer pairs) as conversation context.
- Include a compact summary of the current spec state: which sections have content, which don't. Not the full spec JSON.
- Target total context for a phrase call: under 2000 tokens input.

For `parseAnswer`:

- Include the last 3 turns verbatim.
- Include the **full current spec JSON**, because the model needs to detect contradictions and scope multi-field updates correctly.
- Include the field's Zod schema (converted to JSON schema) as part of the tool definition.
- Target total context for a parse call: under 8000 tokens input.

These are soft budgets. If a genuinely huge spec blows through them, log a warning and proceed — do not truncate the spec itself, because the parser needs it.

---

## Turn recording integration with T-05

T-05 defined `context.conversation_turns` with `llm_model_id`, `llm_tokens_in`, `llm_tokens_out` columns and phases `selection` / `answer` / `clarification` / `skip` / `unskip`.

This ticket adds the persistence logic for `answer` and `clarification` phases:

- When `parseAnswer` returns `kind: "update"`, the HTTP handler (see below) inserts an `answer` turn with outcome `answered`, back-fills the outcome on the matching `selection` turn, and applies the updates via `PATCH /specs/:id` (the existing T-04 endpoint, called internally).
- When it returns `kind: "clarification"`, insert a `clarification` turn with outcome `clarification_requested`, back-fill the matching selection turn.
- When it returns `kind: "skip"`, insert a `skip` turn with outcome `skipped`, back-fill the matching selection turn.
- When it returns `kind: "unknown"`, insert an `answer` turn with outcome `answered`, and write `{ unknown: true, reason }` to the field.

Every turn records `llm_model_id`, `llm_tokens_in`, `llm_tokens_out`. Both phrase and parse calls contribute these numbers — if a turn involved both (selection → phrase → user answer → parse), record the parse call's numbers on the answer turn and the phrase call's numbers on the selection turn.

---

## Limits and circuit breakers

### Turn cap

`CONTEXT_MAX_TURNS_PER_SPEC` (default 60). When `nextTurn` is called and the spec already has ≥ this many turns, return `null` with a distinct `SelectionReason` variant (add `{ kind: "turn_cap_reached" }` to the T-05 type). The UI surfaces this as "We've talked for a while — review what we have, then decide if there's more to add."

### Token cap

`CONTEXT_MAX_TOKENS_PER_SPEC` (default 500000). Sum `llm_tokens_in + llm_tokens_out` across all turns for the spec. When this is hit, the `nextTurn` endpoint returns the same `turn_cap_reached` signal. Log a warning with the final totals.

Both caps are defensive. A well-behaved spec closes in 25–50 turns and well under 200k total tokens.

### Timeout behaviour

If the LLM call times out, return a structured error to the HTTP caller (502 or 504). Do not persist a turn with zero tokens — that would poison the token counter. Log the failure with the selection id so it's diagnosable.

### Rate limit behaviour

The client wrapper handles 429s with backoff. If all retries exhaust, return 429 to the HTTP caller. Do not record a turn on exhaustion either.

---

## HTTP surface

Add to `@context/backend`:

- `POST /specs/:id/turns/answer` — body: `{ turnId: string, userText: string }`. Calls `parseAnswer`, records turns, applies updates if applicable, returns the `ParseResult` to the caller so the UI can react.
- `POST /specs/:id/turns/phrase` — internal; called by the HTTP handler after `nextTurn` to produce the question text. Could be folded into the `POST /specs/:id/turns/next` response from T-05 — your choice. If folded, note it clearly in the PR description.

Auth: caller must be owner or have an `editor` share (T-04a).

---

## Tests

Unit tests for pure bits:

- `buildPhraseContext(turnsForSpec, spec)` returns the expected compact summary.
- `buildParseToolSchema(selection, spec)` produces a Zod-to-JSON-schema object that validates sample inputs correctly.
- `interpretToolUse(toolCall, schema)` maps each of the four tool-call shapes to the correct `ParseResult` kind.

Integration tests with the Anthropic client mocked:

- `phraseQuestion` returns plain text with no markdown (post-hoc assertion; if it starts drifting, that signals a prompt problem).
- `parseAnswer` with a clean "users are admins and customers" input returns a high/medium-confidence update.
- `parseAnswer` with "skip this" returns `kind: "skip"`.
- `parseAnswer` with "not sure, probably later" returns `kind: "unknown"` (or `clarification` if no reason).
- `parseAnswer` with a contradiction returns `kind: "clarification"` with `reason: "contradicts_existing_spec"`.
- Zod validation failure on tool input triggers exactly one retry, then returns clarification.

Live tests (behind a `pnpm test:live` script, not in default `pnpm test`):

- Walk a fixture spec through 10 turns end-to-end against the real API. Assert total tokens stay under a sane ceiling. This is your canary for prompt drift across model updates.

---

## Done when

- You can sit through a full conversation end-to-end (spec creation → threshold met → JSON export) and the questions feel like a thoughtful colleague asked them.
- Conversations on a realistic CRUD-app fixture close in 25–50 turns and under 200k total tokens.
- `parseAnswer` handles "skip", "unknown", contradiction, and multi-field answers correctly in manual testing.
- Invalid tool outputs never persist. Verified by forcing a Zod-violating response in tests.
- Every turn row has non-null `llm_model_id`, `llm_tokens_in`, `llm_tokens_out`.
- Turn cap and token cap fire cleanly and surface in the UI as a distinct terminal state.

---

## Non-negotiables

- No provider abstraction. Anthropic SDK directly. A provider layer is a future refactor, not this ticket.
- System prompts live in markdown files, not inlined in TypeScript.
- `parseAnswer` is the only code path that writes field updates during a conversation. Direct spec edits via T-08's structured pane go through `PATCH /specs/:id` and bypass parsing entirely — those paths stay separate.
- Every LLM call records tokens and model id against a turn row. No exceptions.
- TypeScript strict. Zod-validate every HTTP body and every tool-use input.
- `.env.example` updated in canonical order with comments.
- No streaming in v0.1.

---

## Out of scope

Push back if asked to add any of these:

- Streaming responses.
- Multi-provider support (OpenAI, local models, etc.).
- A "conversation memory" concept separate from the turn log.
- Model-driven selection of the next field (that's T-05's job, and the whole point is it's deterministic).
- Automatic spec summarisation or compression.
- Persona-aware prompting (different tone per user).
- Translation or multilingual support.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Whether to fold `phrase` into the `POST /specs/:id/turns/next` response or keep it a separate call. Separate is cleaner architecturally; folded is one fewer round-trip for the UI.
- Exact few-shot examples in `phrase.md` — generate 3–5 drawn from realistic CRUD-app contexts.
- Whether `confidence: "low"` updates should auto-trigger a confirmation turn in the UI, or just flag the field visually in T-08. My instinct is the latter; this ticket just returns the confidence.
- Whether the live test script runs against Haiku-only to save tokens, or exercises both models.


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
