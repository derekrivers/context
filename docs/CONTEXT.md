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

# T-06 — LLM Adapters: phrase + parse (Revised)

You are implementing ticket **T-06** in the Context MVP build plan. This ticket introduces the two LLM-backed functions that sit on top of the T-05 state machine: one that phrases a question about a target field, and one that parses a user's free-text answer into a structured field update. The LLM does no planning — that's T-05's job. The LLM handles language only.

This ticket depends on T-01 (schema), T-02 (DB), T-03 (auth), T-04 (spec CRUD), T-05 (state machine and turn recording). It does not depend on T-04a or anything later.

---

## ⚠️ Remediation first — an earlier draft of this ticket was wrong

An earlier version of this ticket was drafted under the assumption that Context lives inside the RedDwarf monorepo. **It does not.** Context is a standalone repo at `github.com/derekrivers/context`. RedDwarf is a downstream consumer of Context's exported specs (via T-09 and T-10) and has no shared code with Context.

As a result, code that was already written for T-06 likely contains references to RedDwarf packages that do not exist in the Context repo. **Before writing any new T-06 code, find and remove those references.** Rebuild on clean foundations rather than patching over broken imports.

### Likely damage to find and fix

Search the Context repo for any of the following and treat each hit as a bug:

- Imports from `@reddwarf/*` or relative paths pointing into `packages/control-plane`, `packages/evidence`, `packages/contracts`, `packages/policy`, `packages/execution-plane`, `packages/integrations`. None of these exist in Context.
- References to `REDDWARF_MODEL_PROVIDER`, `REDDWARF_MODEL_*`, or any assumption that Context reuses a RedDwarf LLM client. **No such client exists in Context.** T-06 is where Context's LLM client is built for the first time.
- Imports of a RedDwarf pg pool or config helper. Context has its own pool from T-02 (configured via `CONTEXT_DB_POOL_*` env vars, not `REDDWARF_DB_POOL_*`).
- Env var reads for `ANTHROPIC_API_KEY` that assume it was loaded by RedDwarf's bootstrap. Context loads its own env in T-02's server bootstrap.
- Comments or doc strings that reference "the existing RedDwarf planning agent's LLM call pattern" or similar. There is no such pattern in Context to reuse.

### Remediation procedure

1. Grep the Context repo for the patterns above. List every hit in the PR description.
2. Delete or rewrite each one. Do not leave stubs, do not leave TODO comments. If a file was created solely to bridge to a RedDwarf package, delete the whole file.
3. Check git history for any migration files or `.env.example` edits that reference `REDDWARF_*` variables. Remove them. If a migration already ran against a dev DB, write a follow-on migration to drop any columns or tables that were created based on the wrong assumption.
4. Run `pnpm typecheck` and `pnpm test` across the repo. Nothing should compile against RedDwarf packages because those packages are not in Context's dependency graph. The errors you see are the ones to fix.
5. Only once the repo compiles and tests pass on a clean baseline, proceed with the T-06 implementation below.

If remediation reveals that T-05's turn-recording logic was also coupled to RedDwarf assumptions, stop and flag that before continuing. T-06 cannot be built correctly on top of a broken T-05.

---

## Context — Context repo conventions

Read these from the Context repo before starting:

- `.env.example` at the repo root — canonical env key order. Any new env var goes here in the existing `CONTEXT_*` style with a comment. **Do not reuse `REDDWARF_*` env var names.**
- Root `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts` — reuse whatever T-01 through T-05 established.
- `packages/backend/` — this is where the T-06 code lives. Follow the structure T-02 and T-05 established for routes, db access, and logging.
- `packages/spec-schema/` — source of truth for the spec Zod schema. T-06 converts parts of it to JSON schema for tool-use definitions.
- `CLAUDE.md` / `AGENTS.md` at the repo root, if present.

No RedDwarf files are relevant to T-06. Do not read them. Do not reference them.

---

## Architectural split

Two pure(ish) functions, one thin client module. All three live in `packages/backend/`.

### `packages/backend/src/llm/client.ts`

A minimal wrapper around `@anthropic-ai/sdk`. Exposes a single `callModel({ system, messages, tools?, model, maxTokens }): Promise<ModelResponse>` function. Handles:

- API key loading from `ANTHROPIC_API_KEY` (Context loads this at backend startup — if not already loaded by T-02's bootstrap, add it there as part of this ticket).
- Timeout (30 seconds default, from `CONTEXT_LLM_TIMEOUT_MS`).
- Retries on 429 and 5xx: max 3 attempts, exponential backoff starting at 500ms.
- Returns `{ content, tokensIn, tokensOut, modelId, stopReason }`. Do not leak SDK types beyond this module.

No streaming in v0.1. The conversation UI is not realtime-dependent; wait for the full response.

This is the **first and only** LLM client in Context. Do not look for an existing one to reuse — there isn't one. Do not build an abstraction over multiple providers. Anthropic only.

### `packages/backend/src/conversation/phrase.ts`

```ts
phraseQuestion(
  selection: Selection,   // from T-05
  turnsForSpec: TurnRecord[],
): Promise<PhraseResult>
```

Returns `{ text, tokensIn, tokensOut, modelId }`. The `text` is a single sentence, no markdown, no bullet points, no preamble like "Great question!" The function itself enforces none of that — the system prompt does.

### `packages/backend/src/conversation/parse.ts`

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

Four outcomes, not two. The original ticket said "update or clarification" — that loses information:

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

Add to Context's root `.env.example` (in canonical order, with comments):

```
# -- Context LLM configuration -------------------------------------------------
ANTHROPIC_API_KEY=sk-ant-your_key_here
CONTEXT_PHRASE_MODEL=claude-haiku-4-5-20251001
CONTEXT_PARSE_MODEL=claude-sonnet-4-6
CONTEXT_LLM_TIMEOUT_MS=30000
CONTEXT_MAX_TURNS_PER_SPEC=60
CONTEXT_MAX_TOKENS_PER_SPEC=500000
```

If `ANTHROPIC_API_KEY` is already in `.env.example` from an earlier ticket, don't duplicate it — just ensure it's present.

---

## System prompts

Both prompts live in `packages/backend/src/conversation/prompts/` as `.md` files and are loaded at startup. Don't inline long prompts into TypeScript — they'll be iterated on, and diffs are easier to read as markdown.

### `phrase.md` — tone guidance

Write it to produce questions that feel like a thoughtful colleague is asking, not a form. Key constraints to include:

- One sentence. Occasionally two if the field genuinely needs setup context.
- No markdown, no bullet lists, no numbered lists, no bold, no headers.
- No preamble ("Great question!", "Sure thing!", "Let me ask about...").
- No meta-commentary ("Now I need to understand...", "The next thing to figure out...").
- Reference the existing spec naturally when it helps — "You mentioned the app is for small clinics — roughly how many users per clinic?" — rather than asking in a vacuum.
- Don't ask compound questions. One field, one question.
- Tone: curious, concise, respectful of the user's time. Think "senior engineer interviewing a PM," not "chatbot."

Include 3–5 good/bad pairs in the prompt as few-shot examples. Draw them from realistic CRUD-app spec contexts: asking about entity fields, acceptance criteria, non-goals.

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

- When `parseAnswer` returns `kind: "update"`, the HTTP handler inserts an `answer` turn with outcome `answered`, back-fills the outcome on the matching `selection` turn, and applies the updates via `PATCH /specs/:id` (the existing T-04 endpoint, called internally).
- When it returns `kind: "clarification"`, insert a `clarification` turn with outcome `clarification_requested`, back-fill the matching selection turn.
- When it returns `kind: "skip"`, insert a `skip` turn with outcome `skipped`, back-fill the matching selection turn.
- When it returns `kind: "unknown"`, insert an `answer` turn with outcome `answered`, and write `{ unknown: true, reason }` to the field.

Every turn records `llm_model_id`, `llm_tokens_in`, `llm_tokens_out`. Both phrase and parse calls contribute these numbers — if a turn involved both (selection → phrase → user answer → parse), record the parse call's numbers on the answer turn and the phrase call's numbers on the selection turn.

**Important:** if your remediation in the section above revealed that turn-recording columns were named or typed based on RedDwarf conventions (`reddwarf_tokens_in`, etc.), correct them before implementing this section. The column names are `llm_model_id`, `llm_tokens_in`, `llm_tokens_out` — nothing RedDwarf-prefixed.

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

Add to `packages/backend/src/routes/`:

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

- Remediation section above is complete. Repo compiles, tests pass, no references to RedDwarf packages remain.
- You can sit through a full conversation end-to-end (spec creation → threshold met → JSON export) and the questions feel like a thoughtful colleague asked them.
- Conversations on a realistic CRUD-app fixture close in 25–50 turns and under 200k total tokens.
- `parseAnswer` handles "skip", "unknown", contradiction, and multi-field answers correctly in manual testing.
- Invalid tool outputs never persist. Verified by forcing a Zod-violating response in tests.
- Every turn row has non-null `llm_model_id`, `llm_tokens_in`, `llm_tokens_out`.
- Turn cap and token cap fire cleanly and surface in the UI as a distinct terminal state.

---

## Non-negotiables

- No RedDwarf code, no RedDwarf packages, no RedDwarf env vars. Context is standalone.
- No provider abstraction. Anthropic SDK directly. A provider layer is a future refactor, not this ticket.
- System prompts live in markdown files, not inlined in TypeScript.
- `parseAnswer` is the only code path that writes field updates during a conversation. Direct spec edits via T-08's structured pane go through `PATCH /specs/:id` and bypass parsing entirely — those paths stay separate.
- Every LLM call records tokens and model id against a turn row. No exceptions.
- TypeScript strict. Zod-validate every HTTP body and every tool-use input.
- `.env.example` updated in canonical order with comments. `CONTEXT_*` prefix only.
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
- Any direct integration with RedDwarf. Context exports specs as JSON; RedDwarf consumes them separately via T-09 and T-10.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Whether to fold `phrase` into the `POST /specs/:id/turns/next` response or keep it a separate call. Separate is cleaner architecturally; folded is one fewer round-trip for the UI.
- Exact few-shot examples in `phrase.md` — generate 3–5 drawn from realistic CRUD-app contexts.
- Whether `confidence: "low"` updates should auto-trigger a confirmation turn in the UI, or just flag the field visually in T-08. My instinct is the latter; this ticket just returns the confidence.
- Whether the live test script runs against Haiku-only to save tokens, or exercises both models.



# T-07 — React SPA Scaffold + Spec List

You are implementing ticket **T-07** in the Context MVP build plan. This ticket creates the frontend application and delivers the first usable surface: login, see your specs, create a new one. The authoring view (T-08) is stubbed here — clicking into a spec navigates to a placeholder that just displays the spec id and a "Coming soon" message.

This ticket depends on T-01 (schema package for shared types), T-02 (backend `/health`), T-03 (auth), and T-04 (spec CRUD). If T-04a (sharing) has landed, this ticket picks up the "owned + shared" list distinction; if it hasn't, the list is owned-only and the work is trivially extended later.

---

## Repository layout — Context is its own repo

Context lives at `github.com/derekrivers/context`, not inside RedDwarf. It is a standalone pnpm monorepo. RedDwarf is a consumer of Context's output (via the T-09 adapter and T-10 injection endpoint) — the two codebases are cleanly separated and have no shared packages.

The original MVP plan said: "Same styling and component patterns as `packages/dashboard`." That was aspirational. `packages/dashboard` does not exist in RedDwarf — RedDwarf has no first-party React UI; its operator surface is the OpenClaw Control UI on port 3578 plus the operator HTTP API. There is nothing to mirror.

This ticket establishes Context's frontend conventions from scratch. These become the canonical patterns for any future Context UI work (T-08's authoring view will follow them).

---

## Context — conventions to follow

Read these from the Context repo before starting:

- `pnpm-workspace.yaml` — the workspace glob. T-01 and T-02 should already have established `@context/spec-schema` and `@context/backend` as workspace packages. If not, confirm the package layout with the existing package `package.json` files before creating this one.
- Root `tsconfig.base.json` (or equivalent) — reuse the existing TypeScript strict config. If one doesn't exist yet, create it as part of this ticket so the frontend and any later packages share a single base.
- Root `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts` — reuse if they exist; otherwise establish sensible defaults. Match whatever T-01/T-02 settled on.
- `.env.example` at the repo root — canonical env key order. Any new env var goes here in the existing `CONTEXT_*` style with a comment.
- `CLAUDE.md` / `AGENTS.md` at the repo root, if present.

If any of these don't exist yet because T-01/T-02 didn't need them, create them as part of this ticket with sensible defaults. Do not invent conventions that contradict existing ones.

---

## Package placement

Inside the Context repo, create:

```
packages/frontend/
```

Name it `@context/frontend` in `package.json`, matching the scheme already used by `@context/spec-schema` (at `packages/spec-schema`) and `@context/backend` (at `packages/backend`).

---

## Stack

Fixed choices, not negotiable within this ticket:

- **Vite** + **React 18** + **TypeScript strict**.
- **Tailwind CSS** for styling. No CSS-in-JS, no CSS modules, no raw stylesheets beyond a minimal `index.css` that loads Tailwind and sets the base theme.
- **shadcn/ui** as the component primitive library. Install via the CLI; components live in `src/components/ui/` and are owned by this repo (shadcn is copy-in, not a dependency).
- **TanStack Query** for server state. Every API call goes through a query or mutation — no bare `fetch` in components.
- **TanStack Router** for routing. File-based routes in `src/routes/`.
- **Zod** for API response validation at the network boundary. Share types from `@context/spec-schema` where they exist; derive client-local types from backend DTOs otherwise.
- **Vitest** + **@testing-library/react** for tests. Reuse the root `vitest.config.ts` setup.

Port: **5174**. Configure in `vite.config.ts`. The backend is on 8180 (T-02); dev proxy `/api` → `http://127.0.0.1:8180`.

Do not add: Redux, Zustand, Jotai, MobX, styled-components, Emotion, Material UI, Chakra, Ant Design, or any other state/styling library. TanStack Query + React's built-in state is the full toolkit.

---

## Auth model

Bearer token stored in `sessionStorage` under the key `context.token`. This means the token is cleared when the tab closes — deliberate, because Context will run on laptops that are occasionally handed around and the cost of losing the session is one re-login.

- **Login screen** (`/login`): single input for the token, a "Sign in" button, inline error message on 401. No registration — token provisioning is backend-only via `POST /users` (T-03).
- **Token storage** happens in a single `auth.ts` module that owns `getToken()`, `setToken()`, `clearToken()`. No direct `sessionStorage` access anywhere else.
- **API client** (`api.ts`) reads the token on every request, injects `Authorization: Bearer ...`, and on 401 calls `clearToken()` and redirects to `/login`.
- **Route guards**: unauthenticated users hitting any route other than `/login` are redirected. Use TanStack Router's `beforeLoad` hook.
- **Logout**: a button in the header. Clears token, clears TanStack Query cache, redirects to `/login`.

No refresh tokens. No OAuth. No "remember me." The token the user pastes in is the token they use until it's rotated server-side via `POST /users/:id/rotate-token` (T-03).

---

## Routes

```
/login                  — login screen
/specs                  — spec list (authenticated)
/specs/new              — creates a draft via POST /specs, redirects to /specs/:id
/specs/:id              — authoring view (stub in this ticket, real in T-08)
```

Default landing for an authenticated user is `/specs`. `/` redirects there when authenticated, to `/login` otherwise.

---

## Spec list view

The primary deliverable of this ticket. Design for clarity and density, not flash.

**Header bar:**
- App title ("Context") on the left.
- User's display name / id on the right, with a logout button.

**Main area:**
- Page title: "Your specs".
- Primary action button: "New spec" (top-right of the list area). Calls `POST /specs`, redirects on success.
- A list (not a grid) of specs. One spec per row.

**Each row shows:**
- **Title** — spec's `intent.summary` if present, else "Untitled spec". Clickable; navigates to `/specs/:id`.
- **Completeness bar** — horizontal bar, width proportional to overall completeness score (0–100%). Use the computed value from the `GET /specs` response; if the backend doesn't surface it yet, call `computeCompleteness` from `@context/spec-schema` client-side on the summary payload.
- **Status chip** — one of `draft`, `in_progress`, `complete`, `archived`. Small, coloured, unobtrusive.
- **Owner** — if the spec is owned by the current user, show "You". Otherwise show the owner's display name.
- **Access chip** — only shown for shared specs (when T-04a has landed): `viewer` or `editor`. Omit for owned specs.
- **Last edited** — relative time ("2 hours ago"). Use a small helper, not a date library — no moment, no date-fns needed for one use case.

**Empty state:** when the user has zero specs, show a centered message: "No specs yet. Create one to start." with the "New spec" button prominent.

**Loading state:** a skeleton list of 3 rows. Don't show a spinner.

**Error state:** inline error message with a retry button. Covers both network failures and 5xx responses.

**Sort order:** most recently edited first. No sort controls in this ticket — add them when you have enough specs to need them.

No pagination, no search, no filters in v0.1. A single developer will not have 200 specs.

---

## Stubbed authoring route

`/specs/:id` in this ticket:

- Loads the spec via `GET /specs/:id`.
- Shows the spec title (from `intent.summary` or "Untitled spec") and id.
- Shows a paragraph: "Authoring view coming soon (T-08). This spec exists in the backend and can be inspected via the API."
- Has a "Back to specs" link.

That's it. T-08 replaces this route entirely.

---

## API client

A single `src/lib/api.ts` module. Thin wrapper around `fetch`:

- `apiGet<T>(path, schema: z.ZodType<T>): Promise<T>` — validates response with Zod, throws on shape mismatch.
- `apiPost<T>(path, body, schema)`, `apiPatch`, `apiDelete` similarly.
- On non-2xx, throws a typed `ApiError` with status, message, and optional `code` from the response body.
- On 401, clears the token and redirects. This is the only place auth is imported from a non-auth module — don't spread this logic.

TanStack Query hooks live in `src/queries/` — one file per resource (`specs.ts`, `users.ts`, etc.). Components import hooks, never the raw API client.

---

## Directory layout

```
packages/frontend/
├── package.json
├── tsconfig.json               # extends ../../tsconfig.base.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── src/
│   ├── main.tsx                # React root + QueryClientProvider + RouterProvider
│   ├── index.css               # Tailwind directives + base theme vars
│   ├── lib/
│   │   ├── auth.ts             # token get/set/clear
│   │   ├── api.ts              # fetch wrapper
│   │   └── time.ts             # relative time helper
│   ├── queries/
│   │   └── specs.ts            # useSpecs, useSpec, useCreateSpec
│   ├── components/
│   │   ├── ui/                 # shadcn components (button, input, etc.)
│   │   ├── AppShell.tsx        # header + main layout
│   │   ├── SpecRow.tsx
│   │   ├── CompletenessBar.tsx
│   │   └── StatusChip.tsx
│   └── routes/                 # TanStack Router file-based routes
│       ├── __root.tsx
│       ├── login.tsx
│       ├── specs.index.tsx
│       ├── specs.new.tsx
│       └── specs.$id.tsx
└── vitest.config.ts            # extends root config, adds jsdom
```

Do not deviate from this layout without a reason you'd defend in a PR review. Consistency across Context packages matters more than any individual improvement.

---

## Styling notes

Tailwind only. No arbitrary hex codes sprinkled through JSX — define a minimal palette in `tailwind.config.ts` using CSS variables:

```
--color-bg
--color-bg-subtle
--color-fg
--color-fg-muted
--color-border
--color-accent
--color-status-draft
--color-status-in-progress
--color-status-complete
--color-status-archived
```

Pick sensible defaults (light theme only for v0.1 — dark mode is not scoped). Resist adding visual flourishes: no shadows beyond the default, no gradients, no animations beyond shadcn's built-ins. Context is a serious tool for a thinking task; the UI should recede.

Typography: system font stack. `font-sans` from Tailwind's defaults is fine. No Google Fonts, no custom font loading.

Accessibility: semantic HTML, visible focus rings, label every form input, every icon button has an `aria-label`. shadcn handles most of this out of the box — don't undo it.

---

## Env vars

Add to root `.env.example` in canonical order with comments:

```
# -- Context frontend ---------------------------------------------------------
CONTEXT_FRONTEND_PORT=5174
CONTEXT_BACKEND_URL=http://127.0.0.1:8180
```

The frontend reads `CONTEXT_BACKEND_URL` via Vite's `import.meta.env.VITE_CONTEXT_BACKEND_URL` — expose it with the `VITE_` prefix in `vite.config.ts` using `define` or through Vite's standard env handling. Default to `http://127.0.0.1:8180` if unset.

---

## Tests

Keep the test footprint small in this ticket — the payoff comes in T-08 when real logic lives in the frontend.

Unit tests:
- `auth.ts`: set/get/clear round-trips correctly.
- `api.ts`: 401 triggers token clear and redirect (mock the router).
- `api.ts`: response schema mismatch throws a typed error.
- `time.ts`: relative time helper handles the edges (just now, minutes, hours, days, weeks).

Component tests (React Testing Library):
- `SpecRow`: renders title, completeness bar width, status chip, owner, access chip when present.
- `CompletenessBar`: clamps to 0–100 on out-of-range input.
- Spec list route: renders skeleton on loading, empty state on zero specs, list on success, error state on failure.

No E2E tests in this ticket. Manual verification covers "can log in, see specs, create one."

---

## Done when

- `pnpm --filter @context/frontend dev` boots the app on port 5174 with hot reload.
- `pnpm --filter @context/frontend build` produces a clean production build with no type errors.
- A user with a valid bearer token (issued via the T-03 `POST /users` endpoint) can:
  1. Paste their token on `/login`, click Sign in.
  2. Land on `/specs` and see their existing specs (or the empty state).
  3. Click "New spec" and be redirected to `/specs/:id` showing the stub.
  4. Click "Back to specs" and return to the list.
  5. Click logout and be returned to `/login` with the token cleared.
- Shared specs (if T-04a has landed) appear in the list with the correct access chip.
- Invalid tokens surface as a clear error on the login screen.
- 401 responses anywhere in the app clear the token and redirect to login.
- The root `pnpm test` passes with the new tests included.
- ESLint, Prettier, and `tsc --noEmit` pass cleanly.

---

## Non-negotiables

- Tailwind only. No other styling system.
- TanStack Query for every server interaction. No bare `fetch` in components.
- `sessionStorage`, not `localStorage`. Token does not survive tab close.
- Every API response validated with Zod at the network boundary.
- TypeScript strict across every file.
- No new runtime dependencies beyond what this ticket names. If you think you need one, stop and flag it.
- No dark mode, no theming beyond the CSS-variable palette, no i18n, no animations beyond shadcn defaults.
- File layout matches the spec above. No deviations without justification.

---

## Out of scope

Flag and push back if asked to add any of these:

- User registration UI (tokens are backend-issued).
- Password login, OAuth, SSO.
- Profile editing.
- Multi-user presence indicators on the list.
- Spec search, filtering, tagging, folders.
- Pagination.
- Dark mode.
- Mobile-specific layouts — the list view being narrow-friendly is fine, but no responsive redesign work.
- Any part of the authoring UI (three-pane layout, conversation pane, structured spec pane). That is T-08 and must not bleed into this ticket.
- Admin views, user management, analytics.
- Any direct dependency on the RedDwarf codebase. Context and RedDwarf are separate repos; the only integration between them is the T-09 adapter (which runs inside RedDwarf's pipeline, not Context's frontend) and the T-10 injection endpoint (which Context calls as an external HTTP service).

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Whether `shadcn` components are installed one-at-a-time as needed (leaner) or a standard starter set up front (faster scaffolding). Either is fine; be consistent.
- Whether the completeness percentage is computed client-side from `computeCompleteness` (more accurate, adds bundle weight) or relied on from the backend list response (lighter client). I'd suggest backend by default; if the backend doesn't include it on the list endpoint yet, extend T-04's response shape rather than computing client-side.
- The exact shade of the status-chip colours. Pick something muted; a future design pass will refine.
- Whether to include a "copy spec id" affordance on the list row. Not required; mildly useful for debugging.


# T-08a — Authoring Layout Shell + Conversation Pane

You are implementing ticket **T-08a**, the first of three tickets that together deliver the three-pane authoring UI. This ticket establishes the layout scaffold and delivers a fully working conversation pane. The structured-spec pane (T-08b) and the context/right pane (T-08c) are stubbed here and become real in their respective tickets.

This ticket depends on T-01 (schema), T-02 (backend), T-03 (auth), T-04 (spec CRUD + lock), T-05 (state machine), T-06 (LLM adapters), T-07 (frontend scaffold). T-04a (sharing) is soft-required — share-aware behaviour no-ops gracefully if absent. T-09/T-10 are not required.

---

## Repository reminder

Context is a standalone repo at `github.com/derekrivers/context`. All frontend code lives in `packages/frontend/`. T-08a extends the scaffold from T-07. No new dependencies beyond those in T-07 (Tailwind, shadcn, TanStack Query, TanStack Router, Zod, Vitest). No RedDwarf imports, no RedDwarf env vars.

---

## Scope

### In
- The three-pane layout shell (CSS grid, responsive tabbed fallback).
- Persistent header with spec title (editable in place), lock banner, access banner, Export JSON button, feature-flagged Send to RedDwarf button.
- Lock acquisition and lease renewal on route load.
- The complete conversation pane: turn rendering for all five card types, confidence display, contradiction handling, retry/skip/unknown affordances, input bar with loading states, turn-cap terminal state.
- TanStack Query hooks covering specs, turns, lock, shares — shared with T-08b and T-08c.

### Out (deferred to T-08b)
- The structured spec pane. T-08a renders an empty placeholder pane centre.
- Per-section completeness bars — these render in T-08c's pane 3, which reads from the same query.
- Direct-field edits, Zod validation UX, array-of-objects UI, unknown-field-shell.

### Out (deferred to T-08c)
- Right pane content: overall completeness block, next-action card, unresolved questions list, activity feed. T-08a renders a placeholder pane right with "Context pane — T-08c" text.

### Out (permanently — per MVP plan)
- Real-time collaboration, SSE/websockets, dark mode, version-history UI.

---

## Layout shell

A three-pane layout on screens ≥ 1280px:

```
┌──────────────────────────────────────────────────────────────────────┐
│   Header (spec title, banners, export, send, back link)              │
├──────────────────────────┬──────────────────────────┬────────────────┤
│                          │                          │                │
│   Conversation (40%)     │   [placeholder] (40%)    │   [plc] (20%)  │
│                          │                          │                │
└──────────────────────────┴──────────────────────────┴────────────────┘
```

Below 1280px: tabbed layout with three tabs — **Conversation**, **Spec**, **Context**. Default tab is Conversation. The header remains fixed above the tabs. Below 768px, the header compresses the logout into a menu (acceptable, not required).

Use CSS grid for desktop. No third-party split-pane library. Pane widths fixed at 40/40/20 — no draggable dividers in v0.1.

Placeholder panes render a single centred line of muted text naming which ticket delivers them. Functional enough to ship T-08a without them being broken-looking.

---

## Header

Spans all three panes. Contents:

- **Back link** to `/specs` (left).
- **Spec title** editable in place. Shows `intent.summary` by default; placeholder "Untitled spec". PATCHes via `PATCH /specs/:id` with a 500ms debounce. Tiny "Saved" indicator beside for 1s after success.
- **Status chip** (right side of title): `draft` / `in_progress` / `complete` / `archived`.
- **Lock banner** beneath header (see below).
- **Access banner** beneath header (see below).
- **Export JSON button** (right). Downloads the canonical spec as `<spec-id>-<YYYY-MM-DD>.json` via Blob + anchor click. No backend endpoint — data's already client-side.
- **Send to RedDwarf button** (right). Feature-flagged behind `VITE_CONTEXT_SEND_TO_REDDWARF_ENABLED`. Default `false`. When `false`, button does not render. When `true`, clicking opens a modal placeholder that says "Requires T-09/T-10" if those aren't live, or (once they are) shows the ProjectSpec payload preview and confirm flow.

---

## Lock and access banners

### Lock acquisition

On route load: `POST /specs/:id/lock`. Handle three outcomes:

- **200 / 201 — lock acquired by current user.** No banner. Editing enabled.
- **409 — lock held by someone else.** Render read-only banner beneath header: "Locked by {holder.display}. Their lease expires in {remaining_minutes}m." Poll the lock state every 30s via `GET /specs/:id/lock`. When the lock releases, the banner disappears and editing re-enables without a page reload. Do not attempt to re-acquire automatically — the user might have navigated away; require a user action (e.g., reloading) or let the next mutation attempt acquire naturally.
- **404 / 500** — surface as a global error banner; editing disabled until resolved.

### Lease renewal

While the current user holds the lock and the tab is visible (visibilitychange listener), renew the lease every 2 minutes via the existing lock endpoint. Pause renewal when the tab is hidden.

### Lock release

Release on route unmount, on `beforeunload`, and on explicit "Leave" action (if any). Use `navigator.sendBeacon` for the `beforeunload` release — it survives tab close where a normal fetch wouldn't.

### Access banner (T-04a aware)

If T-04a is landed and the current user is viewing a shared spec:

- Access `viewer`: banner reads "Shared with you by {owner.display} — read-only." All editing disabled across the authoring UI. Lock is not acquired.
- Access `editor`: banner reads "Shared with you by {owner.display}." Editing enabled; lock is acquired normally.
- Owner: no banner.

If T-04a isn't landed, the `GET /specs/:id` response won't include an access field, in which case the code treats the caller as owner and no banner renders.

---

## Conversation pane (the main deliverable)

### Turn rendering

Each turn is a card in a scrollable list. Five card types map 1:1 to the T-05 phases:

**SelectionCard** — shows the phrased question from T-06's `phraseQuestion`. One-line footer in muted italic: "About: `<section>.<path>`". Helps the user see what field is being targeted.

**AnswerCard** — the user's free-text answer. Visually distinct from assistant cards (e.g. right-aligned, different border). Contains a confidence chip if `FieldUpdate.confidence` is `medium` or `low`; `high` renders nothing. Confidence chip is muted, small, text-labelled ("medium confidence").

**ClarificationCard** — the follow-up question from a `clarification` parse outcome. Visually similar to a SelectionCard but with a small "Clarifying" badge and a muted border colour. The original AnswerCard that triggered the clarification remains visible above — do not remove the user's text.

**SkipCard** — compact single-line "Skipped for now" marker. Includes an "Unskip" link that calls the T-05 unskip endpoint.

**UnknownCard** — renders the user's acknowledged unknown with the reason they gave. Same visual language as an AnswerCard with a small "Unknown" chip.

Cards render top-down in `turn_index` order. Latest at the bottom. Auto-scroll to bottom on new turns **except** when the user has scrolled up — respect scroll position as a signal.

### ContradictionCard (special case of clarification)

When `parseAnswer` returns `clarification` with `reason: "contradicts_existing_spec"`, render a ContradictionCard instead of a normal ClarificationCard:

- Header: "This conflicts with what you said earlier."
- Body: shows the old value (at path X) and the new value from the parsed answer.
- Two primary buttons: "Keep old value" (discards new answer, records a turn, moves on) and "Use new value" (applies update, records a turn, moves on).
- Below the buttons, the model's follow-up question text in case the user wants to type a third option.

This is the only place in the UI where the user gets a binary choice on a spec value. Everything else is either free-text answering (here) or direct editing (T-08b).

### Retry budget exhaustion

When T-05 drops a field from the candidate set after 3 unparseable attempts, it surfaces in the right pane (T-08c) as an unresolved question. No special card in the conversation — the conversation simply moves on to the next selectable field.

### Turn cap / token cap reached

When `nextTurn` returns `{ kind: "turn_cap_reached" }`, render a terminal card at the bottom:

> **We've talked through this for a while.**
> Review the spec on the right. If there's more to add, you can edit it directly or raise unresolved questions. To continue the conversation, an operator needs to raise the turn cap for this spec.

No "continue anyway" button. The input disables. The user can still direct-edit in the structured pane (once T-08b lands) without consuming turns.

### Input bar

Fixed at the bottom of the conversation pane:

- Textarea, auto-grows to 5 lines max then scrolls internally.
- Primary "Send" button.
- Secondary actions row above the textarea: "Skip this question" (T-05 skip endpoint) and "I don't know" (pre-fills textarea with "I don't know because..." and focuses the cursor).
- **Enter** sends. **Shift+Enter** inserts newline. **Cmd/Ctrl+Enter** also sends.
- While backend is generating or parsing, input is disabled and shows "Thinking…" indicator. Answers process strictly in order — no queueing.

### Loading states during LLM calls

- After user sends an answer: Send button → spinner, subtle "Parsing your answer…" line below input.
- After turn completes, next selection being phrased: placeholder SelectionCard with shimmer/pulse, labelled "Thinking of the next question…"
- Timeout (504): inline error with Retry button. No turn persisted.
- Rate limit (429): inline message "Paused briefly — the model is rate-limited. Retrying in a moment." Auto-retry once after 5s; if it fails, manual retry.

### Optimistic updates (conversation only)

- User's answer appears as an AnswerCard immediately on submit.
- On backend success: optimistic card replaced with the backend-confirmed turn.
- On `clarification` returned: optimistic answer stays, ClarificationCard appears below it.
- On network failure: optimistic card shows a retry affordance, clearly not-yet-saved.

Everything else in T-08a (completeness, turn history beyond the current burst, lock state) waits for backend confirmation. No optimistic updates on things the user can't correct.

---

## Sync model

### Re-fetch on mutation

No SSE, no websockets. Strategy:

1. On route load: parallel fetches of spec, turns (last 50), lock state, shares (if T-04a).
2. Any mutation invalidates the relevant TanStack Query keys.
3. Refetch happens automatically.

Multi-user editing via T-04a shares does not show live updates — only on refresh or after mutations by the current user. Real-time collaboration is explicitly out of scope.

### Query keys (established in this ticket for later use)

```ts
['specs', specId]                 // full spec — T-08a, T-08b, T-08c all read
['specs', specId, 'turns']        // conversation turns — T-08a writes, T-08c reads
['specs', specId, 'completeness'] // T-08a unused, T-08b writes on edit, T-08c reads
['specs', specId, 'unresolved']   // T-08c
['specs', specId, 'lock']         // T-08a
['specs', specId, 'shares']       // T-08a reads if T-04a present
```

Define all six in `packages/frontend/src/queries/authoring.ts` as part of T-08a so T-08b and T-08c plug in without re-architecting.

---

## Keyboard shortcuts

- **Enter** (in input): send answer.
- **Shift+Enter** (in input): newline.
- **Cmd/Ctrl+Enter** (in conversation pane): send answer.
- **Esc** (in title field): blur without saving; revert.
- **Cmd/Ctrl+S** (with title focused): flush debounce, save immediately.

No global palette, no vim bindings, no `?` help.

---

## Error recovery

- **LLM timeout (504):** inline conversation error, retry button. No turn persisted.
- **Rate limit (429):** inline, auto-retry once, then manual.
- **Backend 500 on title PATCH:** field shows error, reverts optimistic update.
- **Network offline:** top banner "Offline — changes aren't saving." Re-enable on reconnect; user must manually re-save.
- **Lock lost mid-edit:** banner appears, editing disables. Any in-flight mutation that returns 409 surfaces lock-holder info.
- **Session expiry (401):** token cleared, redirect to `/login` (T-07 pattern). Toast on login: "Your session expired; any unsaved changes were lost."

---

## Accessibility

- Every pane has a landmark role: `main` for the layout root, `region` with aria-labels for each pane.
- Every field has a visible label.
- Focus managed on tab collapse/expand — don't strand keyboard users inside a collapsed section.
- All interactive elements reachable via keyboard in sensible order.
- Colour is never the only signal — confidence chips have text, status chips have text.
- shadcn handles most ARIA out of the box; don't undo it.

---

## Component layout

Files this ticket creates:

```
packages/frontend/src/
├── routes/
│   └── specs.$id.tsx                      # replaces the T-07 stub
├── components/
│   └── authoring/
│       ├── AuthoringLayout.tsx            # 3-pane grid + tabbed fallback
│       ├── AuthoringHeader.tsx            # title, banners, export, send
│       ├── LockBanner.tsx
│       ├── AccessBanner.tsx
│       ├── ExportJsonButton.tsx
│       ├── SendToRedDwarfButton.tsx       # feature-flagged shell
│       ├── ConversationPane.tsx
│       ├── ConversationInput.tsx
│       ├── TerminalTurnCard.tsx           # turn-cap / token-cap
│       └── turns/
│           ├── SelectionCard.tsx
│           ├── AnswerCard.tsx
│           ├── ClarificationCard.tsx
│           ├── ContradictionCard.tsx
│           ├── SkipCard.tsx
│           └── UnknownCard.tsx
└── queries/
    └── authoring.ts                        # all six query hooks
```

Placeholder components for the other two panes (delivered in T-08b and T-08c):

```
packages/frontend/src/components/authoring/
├── StructuredPane.tsx     # placeholder: centred muted text "Spec pane — T-08b"
└── ContextPane.tsx        # placeholder: centred muted text "Context pane — T-08c"
```

---

## Handoff contract for T-08b and T-08c

This ticket establishes interfaces the next two tickets plug into. Make these explicit:

1. **Query keys and hooks** live in `queries/authoring.ts`. T-08b adds a `useUpdateField` mutation; T-08c adds a `useUnresolved` query and a `useRetryField` mutation. None of those require re-architecting T-08a's query layout.
2. **`AuthoringLayout.tsx`** accepts three pane children as props: `<AuthoringLayout conversation={...} structured={...} context={...} />`. T-08b replaces the structured prop; T-08c replaces the context prop. T-08a wires placeholder components by default.
3. **Read-only state** (from lock or viewer access) is exposed via a React context (`AuthoringReadOnlyContext`). T-08b will consume this to disable field editing; T-08c will consume it to disable retry/unknown actions in unresolved list.
4. **Active-target tracking** — the current `target_path` from the latest selection turn is exposed via `AuthoringContext` (or similar named context). T-08b uses it to auto-expand the active section. T-08a does not itself consume this — it's for T-08b — but T-08a establishes the context provider and populates it.

These contracts are non-negotiable for T-08a. T-08b and T-08c may extend but must not rewrite them.

---

## Tests

Unit:
- Debounce logic on title save fires exactly once per burst.
- Auto-scroll respects user scroll-up, scrolls on new turns.
- Lock lease renewal fires every 2 minutes when tab visible; pauses when hidden.
- `navigator.sendBeacon` called on `beforeunload` to release lock.

Component (React Testing Library):
- `ConversationPane` renders each of the five card types with fixture data.
- `ContradictionCard` fires the correct mutations on each button.
- `ConversationInput` loading state disables the textarea during mutation.
- `LockBanner` renders only when another user holds the lock; disappears on release.
- `AccessBanner` renders based on the access field; absent when owner.
- Export JSON button produces a file with the expected filename and JSON content.
- `SendToRedDwarfButton` does not render when flag is false; renders placeholder modal when true.

Integration (mocked API):
- Full turn round-trip: user types, optimistic AnswerCard appears, backend responds, card reconciles.
- Clarification round-trip: user types, optimistic AnswerCard appears, ClarificationCard appears below it, user resolves.
- Contradiction round-trip: user types, ContradictionCard appears with old/new values, both button paths fire correct mutations.
- Skip round-trip: user clicks skip, SkipCard appears, unskip action restores field to selection pool.
- Turn cap reached: terminal card renders, input disables.

---

## Done when

- On a 1920px viewport, the three-pane layout renders with conversation working and two placeholder panes visible.
- On a 1024px viewport, the tabbed fallback renders with Conversation as the default tab.
- Header spec title is editable and saves on debounce.
- Lock is acquired on route load; banner appears for contended specs; lease renewal works; release on unmount / beforeunload works.
- Access banner renders correctly for owner, viewer, editor cases when T-04a is present; is absent when T-04a is not.
- All five conversation card types render correctly with realistic fixture data.
- Contradictions get the binary-choice UI; both paths record turns.
- Skip and unskip round-trip cleanly.
- Confidence chips render for `medium` and `low`; absent for `high`.
- Loading states during LLM calls are visible and block duplicate input.
- Turn cap terminal card renders and disables input.
- Export JSON produces a valid canonical spec file.
- Send to RedDwarf button is hidden by default and behind the feature flag.
- All handoff contracts for T-08b and T-08c are in place: query keys defined, layout accepts pane children as props, read-only context established, active-target context established.
- ESLint, Prettier, `tsc --noEmit`, and `pnpm test` all pass.
- You can run an entire conversation from empty spec to a natural terminal state (threshold met, or turn cap reached) without ever needing T-08b or T-08c to be implemented. The only thing missing is the ability to see and edit the structured spec itself.

---

## Non-negotiables

- Tailwind + shadcn only. No new styling system, no new component library.
- TanStack Query for every server interaction.
- No SSE, no websockets.
- `parseAnswer`'s four outcomes each get a distinct card type. Don't collapse them.
- Lock contention is a hard read-only state.
- Send to RedDwarf stays feature-flagged.
- Every user-visible error is readable. No "An error occurred."
- TypeScript strict.
- Handoff contracts for T-08b and T-08c are non-negotiable — they are the interfaces the next two tickets plug into.
- No RedDwarf code, no RedDwarf env vars.

---

## Out of scope (for this ticket)

Flag and push back if asked to add any of these in T-08a:

- The structured spec pane (T-08b).
- The context/right pane (T-08c).
- Per-section completeness bars.
- Direct field editing, Zod inline error UX, array-of-objects UI.
- Unresolved questions list, activity feed, next-action card.
- The Retry endpoint for stuck fields — T-08c owns that.
- All permanently-out-of-scope items from the parent T-08 plan: real-time collab, SSE, dark mode, version-history UI, forking, comments, file uploads, rich text.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Exact colour assignments for confidence chips, status chips, card borders. Pick muted palettes; future design pass will refine.
- Whether the contradiction card's "Use new value" immediately sends the update or queues behind a confirmation. I'd suggest immediate — the card itself is the confirmation.
- Whether to use `<ResizeObserver>` or a CSS container query for the tabbed-layout breakpoint. Either works; pick what's simpler.
- Whether `sendBeacon` needs an auth header workaround (it doesn't support custom headers in all browsers). If so, document the workaround or fall back to a synchronous fetch with `keepalive: true`.

# T-08b — Structured Spec Pane

You are implementing ticket **T-08b**, the second of three tickets that together deliver the three-pane authoring UI. T-08a established the layout shell, header, and conversation pane. T-08b replaces the placeholder centre pane with the live editable structured spec view. T-08c will replace the right placeholder pane.

This ticket depends on T-08a being complete and merged. It also depends on T-01 (schema — specifically `@context/spec-schema` exposing the Zod schema in a form the frontend can traverse), T-02 (backend), T-04 (spec CRUD), T-05 (state machine — the `direct_edit` phase is a new addition here).

---

## Repository reminder

Context is a standalone repo at `github.com/derekrivers/context`. All frontend code lives in `packages/frontend/`. T-08b extends T-08a — no new top-level dependencies. No RedDwarf imports, no RedDwarf env vars.

---

## Scope

### In
- Replace `StructuredPane.tsx` placeholder with the real implementation.
- Vertical accordion of spec sections with auto-expand on active target.
- In-place editing for every field in the canonical spec schema.
- Debounced PATCH saves with inline Zod error feedback.
- Array additions and deletions for entities, capabilities, flows.
- `unknown` field rendering and "Set value" escape hatch.
- Backend: add `phase: "direct_edit"` to the T-05 phase enum; every direct edit writes a turn row.
- Optimistic updates on field saves with revert-on-failure.

### Out (deferred to T-08c)
- Per-section completeness bars visible in the right pane. T-08b is responsible for invalidating the completeness query on save so T-08c's UI updates; T-08b itself doesn't render the bars in the section headers. (It renders a compact progress marker inline with the section header — see "Section headers" — but the main completeness display is in T-08c.)
- Unresolved questions list, activity feed, next-action card.

### Out (permanently)
- Array reordering via drag-and-drop.
- Rich text in any field.
- File/image uploads.
- Inline preview for fields that reference other fields (e.g. showing a capability's dependent entities).
- Undo/redo beyond what `spec_history` already captures.

---

## Consuming T-08a's handoff contracts

T-08a established four contracts this ticket plugs into. Re-read them in T-08a's prompt if needed.

1. **Query keys in `queries/authoring.ts`.** T-08b adds a `useUpdateField` mutation that takes `(specId, path, value)` and PATCHes the spec. On success, it invalidates `['specs', specId]` and `['specs', specId, 'completeness']`. On failure, it surfaces the Zod error to the calling field.
2. **`AuthoringLayout`** accepts a `structured` child prop. T-08b passes the new `<StructuredPane />` in place of the placeholder.
3. **`AuthoringReadOnlyContext`.** T-08b consumes this. When read-only, every field renders as plain text (no input), no "+ Add" buttons, no "Set value" actions, no "Remove" on array items.
4. **`AuthoringContext.activeTargetPath`.** T-08b consumes this to auto-expand the section containing the current target field. When the active target changes, the accordion expands that section and optionally smooth-scrolls the field into view. Don't force-collapse the previously active section — let the user control expand state beyond the initial auto-expand.

---

## Section navigation

The canonical spec has six top-level sections plus two meta sections:

- `intent` (summary, problem, users, non_goals)
- `domain_model` (entities[])
- `capabilities` (capabilities[])
- `flows` (flows[])
- `constraints` (platform, stack, auth, data_retention, performance, compliance, deploy_posture)
- `references` (references[])
- `provenance` (read-only always)
- `extensions` (advanced, collapsed by default, hidden behind a "Show advanced" toggle in the section list footer)

### Section headers

Each section header:
- Section name (larger, bold).
- Compact progress marker on the right: a small pill showing "X of Y" where X is fields with values and Y is total required-ish fields in that section. Use `computeCompleteness(spec)` from `@context/spec-schema` to derive. This is a compact visual — the full completeness bars are in T-08c's pane 3.
- Expand/collapse chevron.
- Sticky behaviour: while a section is expanded and the user scrolls within it, the header remains pinned at the top of the scroll area.

### Expansion behaviour

- On route load: expand `intent` by default plus the section containing the active target, if any.
- On active-target change (new selection turn): auto-expand that section if collapsed. Do not collapse others.
- User clicks: toggles that section freely. User state beats auto-expansion for subsequent selections — if the user has manually collapsed a section, don't re-expand it on the next turn unless they click again.
- `provenance` section: always visible, always collapsed by default, expand on click only. Never auto-expand.
- `extensions` section: hidden behind "Show advanced" at the bottom of the section list.

---

## Field rendering

One dispatch point: `components/authoring/structured/FieldRenderer.tsx`. Given a path in the spec and the Zod schema at that path, it returns the correct field component. Don't scatter `if (type === 'string')` branches through parent components.

### Field types

**String (single-line)** — `<StringField />`. Input element. Debounced save on change, save on blur, save on Cmd/Ctrl+S.

**String (multi-line)** — `<TextareaField />`. Same save behaviour. Auto-grow to 8 lines then scroll. Used for fields marked multi-line in the schema (e.g. `intent.problem`, `intent.summary` if long).

**Enum** — `<EnumField />`. Select dropdown with options from the Zod enum. Save on change (no debounce needed).

**Boolean** — `<BooleanField />`. Toggle. Save on change.

**Number** — `<NumberField />`. Input with `type="number"`. Debounced save. Zod validates numeric bounds.

**Array of primitives** — `<ChipArrayField />`. Chip input — type a value, press Enter, chip appears. Each chip has a remove affordance. Save the full array on each mutation.

**Array of objects** — `<ObjectArrayField />`. List of subcards, one per item. Each subcard:
- Object fields rendered inline using the same `FieldRenderer` recursion.
- A remove button (trash icon) at the top right. Confirms with a subtle inline "Are you sure?" state — no modal.
- A collapse/expand chevron if the object has more than 3 fields.
At the bottom of the list: "+ Add {singular}" button. Creates a new object with all required fields set to empty/unknown defaults per the schema, then scrolls the new subcard into view and focuses the first field.

**Object** — `<ObjectField />`. Nested fieldset. If the object has > 3 fields, it gets its own collapsible header. Otherwise renders inline with no wrapper.

### Field labels and help text

- Every field has a visible label derived from the Zod schema's `.describe()` call (T-01 should have set these on every field).
- Optional help text appears below the input in muted small text, derived from a convention like the second line of `.describe()` or a separate metadata field. T-01 guidance needed here — if T-01 didn't settle it, pick a convention and document it in the PR description.
- Importance annotation (from T-05) does not appear in the UI in v0.1 — it's a backend-only signal.

---

## `unknown` fields

A field with value `{ unknown: true, reason: "..." }` renders with a dedicated shell: `<UnknownFieldShell />`.

Shell contents:
- Dashed border around the field area instead of solid.
- "Unknown" in muted italic where the value would be.
- The reason shown below in smaller muted text.
- A "Set value" link that clears the unknown marker locally and replaces the shell with the normal field component. The first edit to the normal field triggers a save that removes the unknown marker and writes the new value.

An editable field also offers the reverse — a small "Mark unknown" icon in the corner of every field that, when clicked, prompts for a reason (inline popover, one-line input) and writes `{ unknown: true, reason }` on confirm.

---

## Direct edits and the turn log

**Every direct edit writes a turn row** with `phase: "direct_edit"`. This is a new phase added to the T-05 enum.

### Backend addition

Add a new migration that extends the phase CHECK constraint on `context.conversation_turns` to include `direct_edit`. Or, if the column is text without a CHECK, just start writing the new value.

Add a dedicated internal helper (not a new HTTP endpoint — the existing `PATCH /specs/:id` is the surface). The T-04 PATCH handler, on successful save, writes a turn with:

- `phase: "direct_edit"`
- `target_path`: the JSONPath of the edited field
- `target_section`: the top-level section
- `spec_snapshot`: the full spec after the edit
- `completeness_snapshot`: recomputed
- `outcome`: `"answered"` (direct edits are always terminal — no pending selection to back-fill)
- `llm_model_id`, `llm_tokens_in`, `llm_tokens_out`: all null (no LLM involved)
- `selection_reason`: null

If a single PATCH updates multiple fields at once (some Zod validators allow batch PATCHes), write one turn per field changed. Or one turn per PATCH with a list of paths in a new `target_paths` column — pick whichever is consistent with T-05's existing shape. Flag the choice in the PR description.

### Frontend behaviour

Direct edits do not render as cards in the conversation pane. T-08c's activity feed will display them alongside LLM-driven turns so the user sees their own edit history in timeline.

---

## Optimistic updates and revert

On every field edit:

1. Local state updates immediately.
2. TanStack Query mutation fires with the new value.
3. On success: the query invalidates and refetches; local state is replaced by backend state. Tiny "Saved" indicator for 1s.
4. On Zod failure (422 from backend): local state keeps the user's invalid input so they can correct it. The error message from the backend response renders inline below the field in red. The spec itself (backend state) is unchanged.
5. On other backend errors (500, network): local state reverts to the last known backend value. Top banner surfaces the error with retry instructions.
6. On lock contention (409): banner from T-08a takes over; the authoring view becomes read-only.

---

## Validation feedback

- Zod validation is **backend-authoritative**. Do not duplicate validation client-side beyond trivial things like "number input rejects non-numeric characters."
- When the backend returns a 422 with a Zod error path and message, the field at that path renders the error inline below the input, in red, with a small warning icon.
- Multiple errors on different fields show simultaneously.
- T-08c's right pane will also list validation errors so they're not missed if the user has scrolled away — T-08b is responsible for exposing them via the query state; T-08c is responsible for rendering the list.
- The "Saved" indicator only fires on actual success, not on "saved locally but invalid" states.

---

## Read-only mode

If `AuthoringReadOnlyContext` reports read-only (lock held by another user, or viewer-access share):

- Every field renders in a read-only presentation: value visible, no input element. For strings, render as plain text. For arrays, render as a bulleted list or chips without remove affordances. For booleans, render "Yes" / "No" or similar.
- No "+ Add" buttons.
- No "Set value" or "Mark unknown" actions.
- No remove affordances on array items.
- `unknown` fields still show their shell but without the "Set value" link.

Re-enabling after lock release happens automatically via the context — T-08b doesn't need to coordinate directly with the lock polling from T-08a.

---

## Component layout

Files this ticket creates:

```
packages/frontend/src/components/authoring/
├── StructuredPane.tsx                    # replaces T-08a placeholder
├── structured/
│   ├── FieldRenderer.tsx                 # dispatch by Zod schema type
│   ├── SectionAccordion.tsx              # one per top-level section
│   ├── SectionHeader.tsx                 # name, progress pill, chevron
│   ├── StringField.tsx
│   ├── TextareaField.tsx
│   ├── EnumField.tsx
│   ├── BooleanField.tsx
│   ├── NumberField.tsx
│   ├── ChipArrayField.tsx
│   ├── ObjectArrayField.tsx
│   ├── ObjectField.tsx
│   ├── UnknownFieldShell.tsx
│   ├── MarkUnknownPopover.tsx
│   └── index.ts                          # FieldRenderer entry
└── (reuse everything from T-08a)
```

Backend files this ticket touches:

```
packages/backend/src/
├── migrations/
│   └── 2026xxxxx_add_direct_edit_phase.sql   # if T-05 enum is CHECK-constrained
├── routes/
│   └── specs.patch.ts                        # extended to write direct_edit turns
└── conversation/
    └── turns.ts                              # new helper: writeDirectEditTurn()
```

---

## Tests

Unit:
- `FieldRenderer` picks the correct component for each Zod type (string, textarea, enum, boolean, number, array primitive, array object, object).
- Debounce on field saves fires exactly once per burst.
- Optimistic update reverts on save failure.
- Local state preservation on Zod error.
- `UnknownFieldShell` "Set value" transitions correctly.

Component (React Testing Library):
- Each field component round-trips value, onChange, save-on-blur.
- `SectionAccordion` auto-expands on active-target change without collapsing user-expanded sections.
- `ObjectArrayField` add/remove operations work; new items focus correctly.
- Read-only context disables all edit affordances.
- Inline error rendering appears on 422 response.

Integration (mocked API):
- Full direct-edit round-trip: user types in field, optimistic update, PATCH fires, `direct_edit` turn written, local state reconciles.
- Zod error round-trip: user types invalid value, PATCH fires, 422 returned, field shows error, local state preserved.
- Array add round-trip: user clicks "+ Add", new item appears, default fields render, save fires.

Backend:
- `PATCH /specs/:id` writes a `direct_edit` turn on success.
- `PATCH /specs/:id` does not write a turn on Zod failure.
- Multi-field PATCH writes correct turn(s) per the shape decision.

---

## Done when

- The structured pane replaces the T-08a placeholder.
- All six sections + provenance + extensions render with correct collapse/expand behaviour.
- Every field in a realistic CRUD-app fixture spec is editable and saves correctly.
- Auto-expand on active-target change works without overriding user collapse state.
- Zod errors render inline; local state preserves invalid input.
- Array add/remove operations work for entities, capabilities, flows.
- `unknown` fields render their shell correctly with working "Set value" and reverse "Mark unknown" actions.
- Every direct edit produces a `conversation_turns` row with `phase: "direct_edit"` and correct snapshot data.
- Read-only mode disables all editing affordances cleanly.
- A user can complete a spec start-to-finish using only the structured pane (bypassing the conversation entirely) and the resulting data is identical in shape to a conversation-built spec.
- ESLint, Prettier, `tsc --noEmit`, and `pnpm test` all pass.

---

## Non-negotiables

- Tailwind + shadcn only.
- TanStack Query for every server interaction.
- Field type dispatch goes through `FieldRenderer` — no scattered type branches.
- Zod validation stays backend-authoritative.
- Every direct edit writes a `direct_edit` turn. No silent writes.
- Read-only mode is a hard disable, not a soft warning.
- TypeScript strict.
- No new top-level dependencies.
- No RedDwarf code.

---

## Out of scope

Push back if asked to add any of these:

- Right-pane content (T-08c owns all of it).
- Drag-and-drop reordering of array items.
- Rich text editing.
- File/image uploads.
- Field-level history or diff view (the data's in `spec_history` but rendering it is a later ticket).
- Conditional fields (fields that appear only if another field has a specific value).
- Field dependencies displayed inline (e.g. showing which capabilities reference which entity).
- Real-time multi-user cursors.
- Dark mode.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- One turn per direct edit, or one turn per PATCH with a list of paths. Pick whichever matches T-05's existing shape. If T-05's shape doesn't commit to either, one turn per edit is simpler.
- Whether array removal requires confirmation or is immediate. Inline "Are you sure?" is what this prompt specifies; if you find that tedious in practice, immediate with undo is acceptable — document the change.
- Exact visual treatment for `unknown` fields: dashed border is specified; colour choice is yours.
- Whether `computeCompleteness` is called client-side for section-header progress pills, or the backend returns it on `GET /specs/:id`. Client-side is fine for this pill; the backend call happens in T-08c for the main bars anyway.
- Whether the "Mark unknown" popover is a shadcn Popover or an inline form. Popover is more discoverable; inline is less disruptive.

# T-08c — Context / Right Pane

You are implementing ticket **T-08c**, the third and final ticket of the three-pane authoring UI. T-08a established the layout and conversation pane; T-08b added the structured spec pane and direct-edit turn logging. T-08c replaces the right placeholder pane with the real context pane: overall completeness, next-action card, unresolved questions, activity feed.

This ticket depends on T-08a and T-08b being complete and merged. It also depends on T-01 (schema — `computeCompleteness` must be available), T-05 (state machine — unresolved questions live there), T-06 (LLM adapters — token/turn caps feed the next-action logic).

---

## Repository reminder

Context is a standalone repo at `github.com/derekrivers/context`. All frontend code lives in `packages/frontend/`. T-08c extends T-08a and T-08b — no new top-level dependencies. No RedDwarf imports, no RedDwarf env vars.

---

## Scope

### In
- Replace `ContextPane.tsx` placeholder with the real implementation.
- Four vertical sections, stacked: Overall completeness, Next action, Unresolved questions, Activity feed.
- Backend: new endpoint `POST /specs/:id/fields/retry` for re-entering stuck fields into T-05's candidate set.
- Backend: new endpoint `GET /specs/:id/unresolved` returning the list of fields dropped by T-05's retry budget or explicitly marked unanswerable.
- Backend: extend `GET /specs/:id/turns` (from T-05) to support a `?recent=N` query param if not already there.
- Frontend: click-to-navigate between right-pane elements and the structured pane (scrolls and expands the target section).

### Out
- No new conversation behaviour.
- No changes to the structured pane beyond consuming its existing read-only state.
- No version history UI beyond the activity feed's compact summary.
- No analytics, no charts, no dashboards.

---

## Consuming T-08a and T-08b's handoff contracts

T-08a established the query layout and layout-child-props pattern. T-08b added the completeness query invalidation and the `direct_edit` phase. T-08c plugs in without rewriting either.

1. **`AuthoringLayout`** accepts a `context` child prop. T-08c passes the new `<ContextPane />` in place of the placeholder.
2. **Query keys in `queries/authoring.ts`.** T-08c adds:
   - `useCompleteness(specId)` — reads `['specs', specId, 'completeness']` (T-08b already invalidates on edit).
   - `useUnresolved(specId)` — reads `['specs', specId, 'unresolved']`, a new query keyed off the new backend endpoint.
   - `useRecentTurns(specId, limit)` — reads `['specs', specId, 'turns', { recent: limit }]` for the activity feed.
   - `useRetryField(specId)` mutation — calls `POST /specs/:id/fields/retry` with `{ path }`. On success, invalidates `['specs', specId, 'unresolved']` and `['specs', specId, 'turns']`.
   - `useMarkUnanswerable(specId)` mutation — calls `PATCH /specs/:id` with `{ path, value: { unknown: true, reason: "user marked as unanswerable" } }`. Already supported by T-08b's infrastructure; this is a convenience wrapper.
3. **`AuthoringReadOnlyContext`.** T-08c consumes this. When read-only, Retry and Mark-unanswerable buttons don't render. Click-to-navigate to structured pane still works; the structured pane enforces its own read-only.
4. **Active-target tracking.** T-08c reads it to highlight the current target field in the activity feed. No writes.

---

## Section 1: Overall completeness

Top of the pane. The most visible element.

- **Overall completeness score** — large display (e.g. `72%`) centred or left-aligned. Derived from `computeCompleteness(spec).overall`, rounded to nearest percent.
- **Short label below the number** — "Complete" (≥ thresholds met per T-05), "In progress" (partial), "Just started" (< 15%).
- **Six per-section bars** — one horizontal bar per section: `intent`, `domain_model`, `capabilities`, `flows`, `constraints`, `references`. Each shows section name on the left, a fill bar, percent on the right. Click a section bar → scrolls the structured pane to that section and expands it.

Hide `provenance` and `extensions` from this breakdown — they're not part of the completeness contract.

**Threshold visualisation.** From T-05's thresholds:
- `intent` ≥ 0.95
- `domain_model` ≥ 0.80
- `capabilities` ≥ 0.80
- `flows` ≥ 0.60
- `constraints` ≥ 0.60
- `references` ≥ 0.20

Each section bar has a faint threshold marker (a thin vertical line) at the threshold percent. When the fill passes the marker, the bar turns a subtle "met" colour (a shade of green or accent, not saturated). Bars below threshold use neutral grey.

This gives the user a visual sense of "how much more do I need in this section specifically" without surfacing the numeric thresholds directly.

---

## Section 2: Next action

A single card immediately below the completeness block. States, in priority order:

1. **If the conversation has hit the turn cap** (`turn_cap_reached` was the last `nextTurn` response):
   - Card: "We've hit the conversation limit. Review the spec and address unresolved questions below."
   - Primary link: "Review unresolved" (scrolls to section 3 within this pane).

2. **If there are unresolved questions** (`useUnresolved` returns a non-empty list) **and** the spec is below its completeness thresholds:
   - Card: "{N} unresolved question{s}. Resolving them will help the spec progress."
   - Primary link: "Review unresolved" (scrolls to section 3).

3. **If the spec has met all completeness thresholds**:
   - Card: "Spec looks complete. Review, then export or send."
   - Two secondary links: "Export JSON" (triggers the T-08a button) and "Send to RedDwarf" (only if the feature flag is on).

4. **If there's an active selection waiting for a user answer** (latest turn is `phase: "selection"` with no corresponding `answer`):
   - Card: "Answer the current question."
   - Primary link: "Jump to conversation" (scrolls conversation pane to input; on mobile, switches to Conversation tab).

5. **Default** (spec below threshold, no active selection, no cap hit):
   - Card: "Continue the conversation to keep building the spec."
   - Primary link: "Jump to conversation" (scrolls/switches tab).

The card has a subtle accent border or background to distinguish it from surrounding sections, but is not loud. It's advisory, not a call to action.

---

## Section 3: Unresolved questions

A list of fields that T-05 has given up on or the user has marked unanswerable. This is the recovery surface.

### Data source

New backend endpoint: `GET /specs/:id/unresolved` returning an array of:

```ts
type UnresolvedQuestion = {
  path: string;                  // e.g. "capabilities[2].acceptance_criteria[0].given"
  section: string;               // top-level section name
  lastAskedAt: string;           // ISO timestamp
  lastQuestion: string | null;   // the phrased question text, from the last selection turn
  reason: "retry_budget_exhausted" | "user_marked_unanswerable";
  retriesAttempted: number;      // 0 for user-marked, up to 3 for retry-budget
};
```

Backend logic for this endpoint:
- Query `conversation_turns` for this spec.
- For each distinct `target_path`, find the most recent turn.
- If the most recent turn is an answer with outcome `unparseable` and there are ≥ 3 `unparseable` turns in total for that path → include with reason `retry_budget_exhausted`.
- If the field in the current spec is `{ unknown: true, reason: ... }` where reason contains "marked as unanswerable" (or some canonical marker T-08b establishes) → include with reason `user_marked_unanswerable`.
- Exclude paths that have been successfully answered since the last problem turn — resolution clears them from the list.

Sort by `lastAskedAt` descending.

### Rendering

Each entry as a compact card:
- **Path** (e.g. `capabilities[2].acceptance_criteria[0].given`) — monospace, clickable, navigates to that field in the structured pane.
- **Last question asked** (muted) — the phrased question text. If null (user marked unanswerable without ever being asked), show the section name instead.
- **Status line** — "Couldn't parse after 3 tries" or "Marked as won't answer", with `lastAskedAt` as relative time.
- **Actions** (right-aligned, only if not read-only):
  - **Try again** — fires `useRetryField` mutation. Shows a spinner, then the entry either disappears (next conversation selection) or flags "Re-entered conversation" for a moment before disappearing.
  - **Mark answered as unknown** — fires `useMarkUnanswerable` mutation. Writes `{ unknown: true, reason: "user marked as unanswerable" }` to the path. Entry updates to show the unanswerable state but remains visible for the session.

### Empty state

If no unresolved questions: "Nothing unresolved." Compact, muted. Do not hide the section entirely — its presence signals "this is where they'd appear."

---

## Section 4: Activity feed

A compact reverse-chronological feed showing every turn, including `direct_edit` turns that don't appear in the conversation pane.

### Data source

Reuse the turns query from T-05 with a `?recent=50` param. Backend should already have this from T-05; if not, add the param.

### Rendering

Each entry: a single row (not a card), taking one or two lines:

- **Icon or chip** indicating phase: `selection`, `answer`, `clarification`, `skip`, `unskip`, `direct_edit`.
- **One-line summary** derived from phase:
  - `selection`: "Asked about `<path>`"
  - `answer`: "Answered `<path>`"
  - `clarification`: "Needed clarification on `<path>`"
  - `skip`: "Skipped `<path>`"
  - `unskip`: "Unskipped `<path>`"
  - `direct_edit`: "Edited `<path>` directly"
- **Relative timestamp** on the right (e.g. "3m ago").

Click a row → scrolls the structured pane to that field and expands the section.

### Pagination / virtualisation

If the list gets long (> 100 turns), pick one:
- Virtualise with a standard library like `@tanstack/react-virtual`. Small bundle, already in the TanStack family.
- Paginate with "Show more" at the bottom, loading 50 more per click.

Virtualisation is nicer UX; paginate is simpler and adds nothing to the dependency list. Your call; flag the choice in the PR.

### Highlight current target

If `AuthoringContext.activeTargetPath` matches the `target_path` of a recent turn, highlight that row with a subtle accent background. Makes it easier to trace "what just happened" after an LLM turn completes.

---

## Read-only mode

Consume `AuthoringReadOnlyContext`:
- When read-only, hide all Retry and Mark-unanswerable buttons on unresolved questions.
- Next-action card drops any "jump to conversation" links (since the conversation is disabled) and reads "Spec is read-only. You can still export or review unresolved questions."
- Completeness bars remain clickable for navigation.
- Activity feed rows remain clickable.

---

## Backend additions

### New endpoint: `POST /specs/:id/fields/retry`

Body: `{ "path": string }`. Path is a JSONPath-ish dotted string matching the `target_path` convention from T-05.

Behaviour:
- Auth: owner or editor-share.
- 404 if the spec doesn't exist or the caller can't access it.
- 400 if the path isn't currently in the unresolved set (prevents arbitrary re-ranking from the client).
- On success: writes a `conversation_turns` row with `phase: "retry_request"` (new phase, add to the enum if constrained), target_path set, no LLM fields, outcome null. This row signals to T-05's selector that the retry budget for that path should be reset — T-05's selector logic needs a small update to read these rows and zero the count.
- Returns 200 with `{ path, retryCleared: true }`.
- Invalidates `['specs', specId, 'unresolved']` and `['specs', specId, 'turns']` for the caller's query cache (frontend handles this via mutation).

### New endpoint: `GET /specs/:id/unresolved`

See section 3 above for the response shape. Auth: owner or any share (read-only access is enough).

### Extension to `GET /specs/:id/turns`

Ensure it supports `?recent=N` and `?phases=phase1,phase2`. If T-05 didn't implement these, add them. Default limit 50, max 500.

### T-05 selector update (small)

T-05's `selectNextField` has a filter (step 4 in the original prompt) that drops candidates with ≥ 3 `unparseable` outcomes. Update this: a `retry_request` turn for a given path **resets the unparseable count to zero** from that point forward. The simplest implementation: only count unparseable turns that happened after the most recent `retry_request` for that path.

This is a one-file change in `selector.ts`. Add a unit test for it.

---

## Pane layout

```
┌──────────────────────┐
│                      │
│    72%               │   ← Overall completeness
│    In progress       │
│                      │
│  intent        ████  │   ← Section bars with threshold markers
│  domain_model  ██    │
│  capabilities  █     │
│  flows         ▏     │
│  constraints   ██    │
│  references    █     │
│                      │
├──────────────────────┤
│  Next action         │   ← Next-action card
│  Answer the current  │
│  question.           │
│  → Jump to conv.     │
├──────────────────────┤
│  Unresolved (2)      │   ← Unresolved questions
│  ┌────────────────┐  │
│  │ capabilities…  │  │
│  │ Couldn't parse │  │
│  │ [Try again]    │  │
│  └────────────────┘  │
│  ┌────────────────┐  │
│  │ flows[1].steps │  │
│  │ Won't answer   │  │
│  └────────────────┘  │
├──────────────────────┤
│  Activity            │   ← Activity feed
│  ⬤ Asked about… 1m  │
│  ⬤ Edited… 3m        │
│  ⬤ Answered… 5m      │
│  ...                 │
└──────────────────────┘
```

Each section is visually distinct (light divider, slight padding variation) but not over-decorated. The pane is quiet by design.

---

## Component layout

Files this ticket creates:

```
packages/frontend/src/components/authoring/
├── ContextPane.tsx                       # replaces T-08a placeholder
├── context/
│   ├── CompletenessBlock.tsx
│   ├── SectionBar.tsx                    # one row with threshold marker
│   ├── NextActionCard.tsx
│   ├── UnresolvedList.tsx
│   ├── UnresolvedEntry.tsx
│   ├── ActivityFeed.tsx
│   └── ActivityRow.tsx
```

Backend files this ticket touches or creates:

```
packages/backend/src/
├── migrations/
│   └── 2026xxxxx_add_retry_request_phase.sql     # if constrained
├── routes/
│   ├── specs.fields.retry.ts                     # POST /specs/:id/fields/retry
│   └── specs.unresolved.ts                       # GET /specs/:id/unresolved
└── conversation/
    └── selector.ts                               # update: reset count on retry_request
```

---

## Tests

Unit:
- `NextActionCard` picks the correct state given each input permutation (turn cap, unresolved present, threshold met, active selection, default).
- `SectionBar` renders the threshold marker at the correct percent position.
- Activity feed one-line summary renders correctly per phase.
- Unresolved entry shows the correct actions based on read-only state.

Component:
- Click on a section bar scrolls the structured pane and expands the section.
- Click on an unresolved entry's path navigates correctly.
- Click on an activity row navigates correctly.
- Empty states render correctly (no unresolved, no activity).
- Read-only mode hides Retry and Mark-unanswerable buttons.

Integration (mocked API):
- Full retry round-trip: entry in unresolved list, click Try again, mutation fires, list refetches, entry disappears.
- Full mark-unanswerable round-trip: click Mark, PATCH fires, spec refetches, field shows unknown in structured pane (requires T-08b to already be working).

Backend:
- `POST /specs/:id/fields/retry` with a valid path resets the unparseable count.
- With an invalid path (not in unresolved set) returns 400.
- With a non-existent spec returns 404.
- `GET /specs/:id/unresolved` returns correct entries for each reason type.
- T-05's selector now treats paths with a recent `retry_request` as eligible again.

---

## Done when

- The right pane replaces the T-08a placeholder.
- Overall completeness renders correctly on realistic fixture specs.
- All six section bars render with threshold markers and navigate on click.
- Next-action card correctly picks its state across all five scenarios.
- Unresolved questions list pulls from the new backend endpoint and renders correctly.
- Retry action re-enters a stuck field into the conversation candidate set.
- Mark-answered-as-unknown writes the correct spec value via the existing PATCH infrastructure.
- Activity feed shows every turn including `direct_edit`, with correct phase icons and clickable navigation.
- Read-only mode disables the right actions cleanly.
- T-05's selector now resets the unparseable count after a `retry_request` turn.
- You can sit down with a complete Context app — T-07, T-08a, T-08b, T-08c all live — and produce a realistic CRUD-app spec in ~45 minutes of conversation, with the right pane providing navigation and recovery throughout.
- ESLint, Prettier, `tsc --noEmit`, and `pnpm test` all pass.

---

## Non-negotiables

- Tailwind + shadcn only.
- TanStack Query for every server interaction.
- No new LLM calls in this ticket. The right pane is derived entirely from existing data.
- Retry endpoint does not bypass T-05's selection logic — it resets the budget, then lets T-05 pick normally.
- Mark-unanswerable routes through the existing PATCH infrastructure — no parallel write path.
- Read-only state is respected everywhere.
- TypeScript strict.
- No RedDwarf code, no RedDwarf env vars.

---

## Out of scope

Push back if asked to add any of these:

- Charts, graphs, burn-down visualisations.
- A spec "health score" beyond raw completeness (no quality metrics, no coverage scores).
- Commenting or threaded discussion on unresolved questions.
- Assigning unresolved questions to specific users.
- Scheduled reminders or notifications for unresolved questions.
- Bulk actions on activity feed (batch-revert edits, etc.).
- Searchable activity feed — too much work for v0.1. If it's needed, it's a later ticket.
- Turn-level diff view showing what changed. Linked path + field navigation is enough.
- Export of activity feed as CSV/JSON.
- Dark mode.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Virtualise or paginate the activity feed. Pick based on dependency cost vs UX.
- Exact visual treatment of the threshold marker on section bars (thin line, chevron, tick). Pick something restrained.
- Whether the next-action card's priority order needs tweaking based on real-world use — the five-tier order specified here is a starting point.
- Whether `retry_request` is a new phase in `conversation_turns` or reuses an existing phase with different semantics. New phase is cleaner; extending an existing phase is less migration work. Pick what fits T-05's actual enum shape.
- Whether unresolved questions should also appear in the activity feed or be deliberately separate. I'd suggest separate — the activity feed is "what happened," unresolved is "what's stuck." Different mental models.
# T-09 — RedDwarf Adapter Package

You are implementing ticket **T-09** in the Context MVP build plan. This ticket creates the translation layer between Context's canonical spec and RedDwarf's ProjectSpec. It is a pure function with no network calls, no side effects, no persistence — just data in, data out, plus translation notes flagging anything dropped.

This ticket depends on T-01 (canonical schema). It does **not** depend on T-10 — the adapter can ship before RedDwarf's injection endpoint exists. The adapter's output is validated against RedDwarf's ProjectSpec schema (see "Target schema" below), which must exist in RedDwarf today.

---

## Which repo this ticket lives in

**Context repo** (`github.com/derekrivers/context`). New workspace package: `packages/reddwarf-adapter/`, published internally as `@context/reddwarf-adapter`.

T-09 does **not** touch the RedDwarf repo. The adapter produces a payload that matches RedDwarf's public contract; the actual injection happens in T-10, which is a RedDwarf-side ticket.

---

## Target schema — read RedDwarf before writing code

Before writing any adapter code, read RedDwarf's actual ProjectSpec schema. This ticket translates into that schema, not one we invent.

The agent must:

1. Clone or browse `github.com/derekrivers/RedDwarf` locally.
2. Locate the ProjectSpec Zod schema. Likely candidates (in priority order): `packages/contracts/`, `schemas/`, or a package exporting project-shaped types.
3. Read the schema end to end. Note: required fields, optional fields, nested structures (especially any TicketSpec / TaskManifest nesting inside a project), enums, and validation constraints.
4. Document in the PR description the exact file path and version of the schema being targeted.

If the ProjectSpec schema does not exist in RedDwarf yet, stop and flag that before proceeding. This ticket cannot be built correctly against a schema that isn't real. Ask which existing RedDwarf artifact (TaskManifest, planning spec, whatever) is the closest fit and reshape T-09 accordingly. Do not invent a schema.

### Target consumption strategy

Pick one of these approaches for how the adapter knows the target schema; flag the choice in the PR description:

- **Vendored types.** Copy the relevant Zod schema (or hand-derived TypeScript types) into `packages/reddwarf-adapter/src/reddwarf-types.ts` with a comment pointing at the source file in RedDwarf and a version string. Pros: no dependency on RedDwarf's internals. Cons: can drift.
- **Published dep.** If RedDwarf publishes `@reddwarf/contracts` (or similar) to a registry you can consume, depend on it. Pros: stays in sync. Cons: Context now has a hard dependency on RedDwarf's release cadence.
- **Git submodule or workspace link.** Don't do this for v0.1. Too fragile for a solo-dev MVP.

Vendored is the default unless RedDwarf publishes a package you can consume cleanly.

---

## Scope

### In

- `packages/reddwarf-adapter/` workspace package.
- Pure function `toProjectSpec(canonicalSpec: CanonicalSpec): { projectSpec: ProjectSpec, translationNotes: TranslationNote[] }`.
- Schema version pinning: the adapter declares a target ProjectSpec schema major version. Mismatch at load time throws a loud error.
- Reading of `extensions['reddwarf:project_spec']` for caller-supplied overrides.
- Inference defaults when extensions are absent.
- Translation of canonical capabilities → RedDwarf's task / ticket representation in dependency order.
- Translation notes covering every dropped or inferred field.
- Exhaustive unit tests against fixture canonical specs.

### Out

- Any network call. The adapter is a pure function.
- Any filesystem or database access.
- Persistence of the output. The caller (T-08's "Send to RedDwarf" flow) handles transport.
- Reverse translation (ProjectSpec → canonical). One-way only in v0.1.
- Multi-project output. One canonical spec → one ProjectSpec.
- Language translation, summarisation, or LLM calls. The adapter is deterministic.

### Permanently out of scope

- Bidirectional sync.
- Partial / incremental translation.
- Diffing two canonical specs and producing a ProjectSpec patch.
- Non-RedDwarf target adapters (Jira, Linear, Asana). Each would be its own package.

---

## Function contract

```ts
export type TranslationNote = {
  kind: "dropped" | "inferred" | "downgraded" | "grouped" | "coerced";
  canonicalPath: string;           // path in the source canonical spec
  projectSpecPath: string | null;  // path in the output ProjectSpec, if applicable
  reason: string;                  // human-readable
  severity: "info" | "warning";
};

export type AdapterResult = {
  projectSpec: ProjectSpec;        // RedDwarf's published type, imported or vendored
  translationNotes: TranslationNote[];
  contextSpecId: string;           // from canonicalSpec.id, passthrough for provenance
  contextVersion: number;          // from canonicalSpec.version (a spec mutation counter from T-04)
  adapterVersion: string;          // e.g. "0.1.0", from package.json
  targetSchemaVersion: string;     // RedDwarf ProjectSpec schema major version the output validates against
};

export function toProjectSpec(
  canonicalSpec: CanonicalSpec,
): AdapterResult;
```

The function is synchronous and pure. No async, no promises, no mutation of the input.

### Invariants

- Every translation note has a non-empty `reason` written for a human reviewer.
- The output `projectSpec` validates against the target Zod schema. The adapter calls the target's `.parse()` before returning and throws if validation fails (that's a bug in the adapter, not the input).
- If a required ProjectSpec field has no canonical source and no inferred default, the adapter throws a `TranslationError` with the path and a message explaining what's missing. The caller surfaces this in the UI as "Your spec is missing fields RedDwarf requires."
- `translationNotes` is ordered deterministically: by `severity` descending (warning before info), then by `canonicalPath` ascending.

---

## Translation rules

Once you've read RedDwarf's real ProjectSpec schema, the mappings below need reconciling with what's actually there. Treat these as directional, not authoritative. Flag every deviation in the PR description.

### Top-level mapping (expected)

| Canonical source | ProjectSpec target | Notes |
|---|---|---|
| `intent.summary` | project name / title | Truncate if RedDwarf has a length limit; note the truncation. |
| `intent.problem` | project description | Include verbatim where length allows. |
| `intent.users` | audience / stakeholder metadata if ProjectSpec has it, else dropped with note | |
| `intent.non_goals` | explicit non-goals field if present, else dropped with note | |
| `domain_model.entities` | metadata / context bundle if ProjectSpec supports freeform context, else dropped with note | RedDwarf's Architect regenerates this from the planning pass; we don't force it. |
| `capabilities[]` | tasks / tickets (one per capability) | See "Capabilities → Tasks" below. |
| `flows[]` | attached to the tasks that implement them, or included as flow metadata on the project | Depends on ProjectSpec shape. |
| `constraints.*` | project-level constraints or per-task constraints | Depends on ProjectSpec shape. |
| `references[]` | project references / links if supported, else dropped with note | |
| `provenance.*` | discarded | Provenance is Context-internal. |
| `extensions['reddwarf:project_spec']` | merged over the inferred output | See "Extension overrides" below. |

### Capabilities → Tasks

Each capability becomes one task. For each capability:

- **Task title** = capability verb + capability name (e.g. "create user", "list invoices").
- **Task description** = capability description plus a formatted block of acceptance criteria (given/when/then).
- **Task risk class** = inferred from capability metadata if available, else defaults to `medium`. Log an `inferred` translation note per task so the reviewer can sanity-check before approval.
- **Task capability flags** (`can_write_code`, `can_run_tests`, `can_open_pr`, etc.) = pulled from `extensions['reddwarf:project_spec'].default_task_capabilities` if present, else a conservative default of `can_plan, can_write_code, can_run_tests, can_open_pr`. Log a `inferred` note when defaults are used.
- **Task dependencies** = derived from cross-capability references in the canonical spec. If capability B's `given` clause references entities created by capability A, A becomes a dependency of B. If the dependency graph is ambiguous, produce the tasks in canonical order with no dependencies and emit a `warning` note.

Task ordering in the output array is topological: dependencies come before dependents. If RedDwarf's ProjectSpec represents dependencies via explicit fields, use those. If it represents them implicitly via order, rely on the array order.

### Flows

Each flow is a sequence of steps that touches one or more capabilities. Map:

- **Flow name** → attached to each dependent task as "implements flow: X" in the task description.
- **Flow steps** → rendered as a numbered list in the task description of the first implementing task, with a note linking to subsequent tasks.
- **Failure modes** → appended to each implementing task's description under a "Failure modes to handle" heading.

If ProjectSpec has a first-class flow field, use it instead. This prompt is written assuming it doesn't — adjust when you've read the real schema.

### Constraints

- **Platform, stack** → project-level constraint fields if present, else concatenated into the project description under a "Technical constraints" heading.
- **Auth, data_retention, compliance, performance** → same treatment.
- **Deploy posture** → project-level if first-class, else description.

### Unknown fields

Any canonical field with value `{ unknown: true, reason }` is dropped with a `dropped` translation note. If the field maps to a required ProjectSpec field, this triggers a `TranslationError` — the caller cannot ship an incomplete ProjectSpec to RedDwarf.

---

## Extension overrides

The canonical schema reserves `extensions['reddwarf:project_spec']` for caller-supplied overrides. This is the escape valve for users who want precise control.

Behaviour:

- Extension values **override** inferred values, never the reverse.
- Every override writes an `info` translation note: `"Overridden by extensions['reddwarf:project_spec'].<path>"`.
- Extension paths that don't correspond to any ProjectSpec field trigger a `warning` note and are silently dropped. Don't fail the translation — a caller pinning an extension that no longer maps after a schema upgrade should see a warning, not a crash.

The extension shape itself is a partial ProjectSpec. No special schema — users write whatever ProjectSpec fields they want to pin.

---

## Schema version pinning

The adapter is pinned to a specific major version of the RedDwarf ProjectSpec schema.

At module load time:

```ts
const ADAPTER_TARGET_MAJOR = 1;  // adjust per your read of RedDwarf's schema

if (ProjectSpecSchema.version.major !== ADAPTER_TARGET_MAJOR) {
  throw new Error(
    `@context/reddwarf-adapter is pinned to ProjectSpec major v${ADAPTER_TARGET_MAJOR}, ` +
    `but RedDwarf exports v${ProjectSpecSchema.version.major}. ` +
    `Upgrade the adapter before continuing.`
  );
}
```

If RedDwarf's schema doesn't expose a version number at runtime, agree a convention with RedDwarf (a `SCHEMA_VERSION` const exported from the contracts package) and add it there as part of this ticket. Note it in the PR description.

---

## Error model

```ts
export class TranslationError extends Error {
  constructor(
    public missingPaths: string[],
    public partialNotes: TranslationNote[],
  ) {
    super(`Cannot translate: missing required fields: ${missingPaths.join(", ")}`);
  }
}

export class SchemaVersionError extends Error {
  constructor(public expected: number, public actual: number) {
    super(`Adapter expects ProjectSpec v${expected}, got v${actual}`);
  }
}
```

Any other unexpected input (malformed canonical spec, for instance) should also throw a typed error — don't let ad-hoc `Error` instances leak out.

---

## Package layout

```
packages/reddwarf-adapter/
├── package.json
├── tsconfig.json                     # extends ../../tsconfig.base.json
├── src/
│   ├── index.ts                      # exports toProjectSpec, types, errors
│   ├── adapter.ts                    # the pure function
│   ├── rules/
│   │   ├── intent.ts                 # intent → project top-level
│   │   ├── capabilities.ts           # capabilities → tasks + dependency topo-sort
│   │   ├── flows.ts                  # flow attachment logic
│   │   ├── constraints.ts            # constraints → project fields or description
│   │   └── references.ts
│   ├── reddwarf-types.ts             # vendored ProjectSpec type (if vendored approach)
│   ├── errors.ts                     # TranslationError, SchemaVersionError
│   └── version.ts                    # ADAPTER_VERSION, ADAPTER_TARGET_MAJOR
├── fixtures/                         # canonical-spec fixtures for tests
│   ├── minimal-crud.json
│   ├── complex-with-flows.json
│   ├── with-unknowns.json
│   ├── with-extensions-override.json
│   └── missing-required-field.json
└── src/__tests__/
    ├── adapter.test.ts               # end-to-end: fixture → ProjectSpec → validates
    ├── intent.test.ts
    ├── capabilities.test.ts
    ├── flows.test.ts
    ├── constraints.test.ts
    ├── extensions.test.ts
    ├── unknowns.test.ts
    └── errors.test.ts
```

No `index.ts` barrel files inside `rules/`. Each rule module exports the specific functions it owns.

---

## Tests

The adapter lives or dies by tests. This is the part of the system most exposed to the real world; bugs here produce confusing approval failures downstream in RedDwarf.

### Required fixtures

- `minimal-crud.json` — two entities, three capabilities, one flow, no unknowns, no extensions. Round-trips cleanly.
- `complex-with-flows.json` — five entities, eight capabilities, three flows with failure modes, realistic constraints.
- `with-unknowns.json` — some fields explicitly marked `{ unknown: true, reason }`. Non-required unknowns are dropped with notes; a required unknown triggers `TranslationError`.
- `with-extensions-override.json` — a realistic `extensions['reddwarf:project_spec']` that pins title, risk classes, and capability flags on specific tasks.
- `missing-required-field.json` — `intent.summary` is absent. Must throw `TranslationError` with path `intent.summary`.

### Required assertions

For every fixture:
- The returned `projectSpec` validates against RedDwarf's actual schema (import and `.parse()`).
- `translationNotes` contains exactly the expected entries — not a superset.
- Task dependency order is topological when dependencies exist.
- Deterministic: running the adapter on the same input twice returns identical output (including note ordering).

Snapshot tests are acceptable for the full output. They're fast feedback when refactoring, and the fixtures aren't so long that diffs become unreadable.

### Fuzz / property test (optional but recommended)

A lightweight property test: given a randomly generated canonical spec that passes T-01's Zod validation, `toProjectSpec` either returns a valid ProjectSpec or throws a typed error. It never throws an untyped error, never returns invalid output. Use `fast-check` if you want this; skip if it bloats the ticket.

---

## Done when

- `pnpm --filter @context/reddwarf-adapter build` produces clean output with no type errors.
- `pnpm --filter @context/reddwarf-adapter test` passes all fixture tests.
- A canonical spec produced by a real T-08 conversation (the "genuine 45-minute spec" from T-08's done-when) translates cleanly through the adapter and the output validates against RedDwarf's schema.
- Running the adapter twice on the same canonical spec produces byte-identical output.
- Dropping or changing any field in RedDwarf's ProjectSpec schema produces a clean build error in the adapter, not a silent miscompile.
- PR description documents: which RedDwarf file/version is being targeted, the consumption strategy (vendored/dep), every deviation from this ticket's directional mapping table, and any clarifications needed from the RedDwarf team.

---

## Non-negotiables

- Pure function. No network, no fs, no db, no LLM. If you think you need any of those, stop and flag.
- Output validates against RedDwarf's real schema. No mocks, no hand-written shape pretending to be the target.
- Translation notes make silent information loss impossible. Every dropped field, every inferred value, every downgrade — one note each.
- Schema version mismatch is a hard error at load time, not a runtime surprise.
- `extensions['reddwarf:project_spec']` overrides inferred values, never the reverse.
- TypeScript strict.
- No RedDwarf env vars (the adapter has no runtime config).
- No new top-level dependencies beyond Zod (already in Context) and optionally `fast-check` for property tests.

---

## Out of scope

Push back if asked to add any of these:

- A reverse adapter (ProjectSpec → canonical).
- Multi-target adapters (Jira, Linear).
- LLM-assisted translation.
- HTTP calls, file writes, DB writes.
- A CLI for the adapter. If T-10 wants one, that's T-10's problem.
- Caching or memoisation. The adapter is fast enough that it doesn't need it.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Vendored types vs published dep — pick based on what RedDwarf actually ships.
- Whether canonical capabilities produce tasks eagerly (every capability → task) or lazily (only capabilities marked "implement in first pass" → task). Eager is the default; note if RedDwarf's planning agent would prefer something different.
- How flow failure modes get attached to tasks — inline in description, or a separate ProjectSpec field if one exists.
- Whether `intent.users` maps to a real ProjectSpec field or drops with a note. Depends on schema.
- The exact string formatting for task descriptions (Markdown? Plain text? Freeform?). RedDwarf's Architect will re-read these, so clarity trumps prettiness.


# T-10 — RedDwarf Injection Endpoint

You are implementing ticket **T-10** in the Context MVP build plan. This is the final ticket. It closes the loop: Context exports a ProjectSpec via the T-09 adapter, posts it to RedDwarf, and RedDwarf creates the project in its existing approval queue — the same state a Project Mode planning run would produce, so the existing human-approval flow works unchanged.

This ticket depends on T-01 through T-09 of Context, plus whatever RedDwarf infrastructure already exists for Projects and approval (documented in RedDwarf's architecture doc and contracts).

---

## Which repo this ticket lives in

**RedDwarf repo** (`github.com/derekrivers/RedDwarf`), not Context. All files created or modified by this ticket are inside the RedDwarf monorepo.

This is a crucial distinction from every other ticket in the Context MVP plan. The PR goes against `derekrivers/RedDwarf`, not `derekrivers/context`. The agent must:

- Clone or work inside the RedDwarf repo.
- Follow RedDwarf's conventions (AGENTS.md, CLAUDE.md, `REDDWARF_*` env vars, existing package structure).
- Open the PR against RedDwarf's default branch.
- Not import anything from the Context repo.

T-10 is the one place in the entire MVP plan where a cross-repo touch happens. Context's T-08 "Send to RedDwarf" flow calls this endpoint over HTTP; it does not link to RedDwarf code at build time.

---

## Context — read RedDwarf first

Before writing any code, the agent reads:

- `AGENTS.md` — autonomous execution conventions. Follow them.
- `CLAUDE.md` — if present.
- `FEATURE_BOARD.md` — context on the priority of this work. Note especially feature #96 ("Direct task injection endpoint — `POST /tasks/inject`"). T-10 is conceptually related but targets the Project entity rather than raw Tasks. If feature #96 has landed, reuse its patterns. If not, T-10 establishes the pattern and feature #96 may converge on it later.
- `openclaw_ai_dev_team_v_2_architecture.md` — the canonical architecture doc.
- `docs/agent/Documentation.md` and `docs/agent/TROUBLESHOOTING.md` — persistent repo memory.
- The operator API routes (likely in a `packages/control-plane` or equivalent package). Note auth middleware (`REDDWARF_OPERATOR_TOKEN`), error shapes, and logging conventions.
- The ProjectSpec Zod schema (same schema T-09 targeted; whoever implemented T-09 documented the path in their PR).
- The existing approval queue mechanics: how `pending_approval` state is reached for a Project Mode planning run, where approval records persist, how the operator UI lists pending approvals, and how approvals route back into the pipeline post-decision.
- The evidence plane persistence layer, because translation notes will archive there.

If any of these aren't reachable or have changed materially since this ticket was drafted, stop and flag before proceeding.

---

## Scope

### In

- New operator API route: `POST /projects/inject`.
- Request validation against the existing ProjectSpec Zod schema.
- Persistence of the injected project in the same database state as a Project Mode planning run reaches when it produces a pending-approval project.
- Persistence of provenance metadata (`context_spec_id`, `context_version`, `adapter_version`, `target_schema_version`).
- Archival of translation notes to the evidence plane.
- Idempotency on `(context_spec_id, context_version)` — re-posting returns the existing project rather than creating a duplicate.
- Operator UI surfacing of provenance on the project detail view (minor addition).
- Integration tests covering: valid injection, invalid ProjectSpec (422), idempotent re-submit, auth rejection, schema version mismatch.
- Updates to `.env.example`, operator API route documentation, and the FEATURE_BOARD entry if one exists for this work.

### Out

- Any change to the approval logic itself. The endpoint must produce a project in the same state the existing planning path produces; after that, the existing flow is untouched.
- Any Context-side code. Context's "Send to RedDwarf" button is wired in T-08a behind a feature flag; when this ticket lands, the flag can be flipped — but flipping it is not part of T-10.
- Batch injection (multiple projects in one POST). One project per request.
- An async queue for injection. The endpoint is synchronous: validate, persist, return project ID.
- Notifications (Discord, Slack). Existing approval queue notifications should fire naturally once the project is in the queue — verify they do, but don't add new notification paths.
- Rate limiting beyond whatever's already in place on operator routes.
- Authentication other than the existing `REDDWARF_OPERATOR_TOKEN` bearer auth.

### Permanently out of scope

- Bidirectional sync (RedDwarf approval decisions flowing back to Context).
- Streaming updates (SSE, webhooks).
- Multi-tenant support. This is single-operator.
- Re-execution on adapter version upgrade (existing pending-approval projects stay as they were).

---

## Endpoint contract

### Request

`POST /projects/inject`

Headers:
- `Authorization: Bearer <REDDWARF_OPERATOR_TOKEN>` (existing operator auth middleware).
- `Content-Type: application/json`.

Body:

```ts
type InjectionRequest = {
  projectSpec: ProjectSpec;        // RedDwarf's existing Zod schema
  provenance: {
    context_spec_id: string;       // UUID from Context
    context_version: number;       // Context's per-spec mutation counter
    adapter_version: string;       // semver, e.g. "0.1.0"
    target_schema_version: string; // RedDwarf ProjectSpec schema version the adapter targeted
    translation_notes: TranslationNote[];  // the full adapter output notes
  };
};

type TranslationNote = {
  kind: "dropped" | "inferred" | "downgraded" | "grouped" | "coerced";
  canonicalPath: string;
  projectSpecPath: string | null;
  reason: string;
  severity: "info" | "warning";
};
```

The `TranslationNote` shape matches T-09's output exactly. Duplicate the type here in RedDwarf — do not import from Context. This is the contract boundary between the two systems.

### Responses

- **201 Created** on new project injection. Body:
  ```ts
  { project_id: string, state: "pending_approval", provenance_id: string }
  ```
- **200 OK** on idempotent re-submit (matching `context_spec_id` + `context_version` already exists). Body:
  ```ts
  { project_id: string, state: "<current state>", provenance_id: string, deduplicated: true }
  ```
- **400 Bad Request** — malformed JSON, missing fields.
- **401 Unauthorized** — missing or invalid bearer token.
- **403 Forbidden** — token valid but scoped such that injection isn't permitted (follow existing operator-token conventions).
- **409 Conflict** — idempotency key collision where the existing project is in an incompatible state (e.g. approved but the resubmit would overwrite). Body includes enough info to disambiguate. Prefer this over silent overwrite.
- **422 Unprocessable Entity** — ProjectSpec failed Zod validation. Body includes the Zod error paths and messages verbatim.
- **5xx** — unexpected. Standard RedDwarf error shape.

Error body shape follows whatever RedDwarf's existing operator routes return. Don't invent a new error format.

---

## Persistence

### Project record

Persist the project in the same tables and the same state that a Project Mode planning run produces when it reaches pending-approval. Read the existing planning code and reuse its persistence helpers. Do not duplicate logic — if the existing pipeline exposes a function like `recordProjectPendingApproval(projectSpec, metadata)`, call that. If it doesn't, refactor the existing code to extract one as part of this ticket.

The reviewer of this PR should not be able to find a single line of persistence logic in the injection route that isn't either (a) a call to the existing planning persistence layer, or (b) provenance-specific persistence introduced by this ticket.

### Provenance record

New persistence — the cleanest approach is a sibling table or column set to the existing project tables.

Suggested table: `context.project_spec_provenance` (namespace matches other RedDwarf tables). Columns:

```sql
CREATE TABLE context.project_spec_provenance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES <existing projects table>(id) ON DELETE CASCADE,
  context_spec_id       TEXT NOT NULL,
  context_version       INTEGER NOT NULL,
  adapter_version       TEXT NOT NULL,
  target_schema_version TEXT NOT NULL,
  injected_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  injected_by           TEXT,                    -- operator identifier if available
  UNIQUE (context_spec_id, context_version)
);

CREATE INDEX project_spec_provenance_project_id_idx
  ON context.project_spec_provenance(project_id);
```

The `UNIQUE (context_spec_id, context_version)` constraint is the **idempotency key**. See "Idempotency" below.

Adjust the schema name and references based on what exists in RedDwarf's migration history. Follow whatever the control-plane package already uses.

### Translation notes archival

Translation notes go to the **evidence plane**, not to the provenance table. Each injection produces one evidence record containing the full notes array plus a pointer back to the project and provenance. Reuse whatever evidence-plane API RedDwarf already exposes for archiving structured artifacts.

If the evidence plane stores artifacts by key, use the key `project-inject-{project_id}-translation-notes`. If it stores by row, match whatever shape other evidence rows use.

Translation notes are read-only after archival. No editing, no re-running.

---

## Idempotency

The `UNIQUE (context_spec_id, context_version)` constraint enforces that re-posting a spec with the same version never creates a second project.

On constraint violation, the handler:

1. Fetches the existing provenance record and the project it references.
2. Checks the project's current state:
   - If in `pending_approval` — returns 200 with `deduplicated: true`. User can re-fetch status without drama.
   - If in any later state (approved, in_development, completed, failed) — returns 200 with `deduplicated: true` and the current state. Does not revert, does not error.
   - If the project was deleted or cancelled such that a fresh injection would make sense — returns 409 with a message like "Previously injected project was cancelled. Bump `context_version` and retry."

The decision to bump `context_version` lives on the Context side. T-10 does not mutate Context's state.

---

## Operator UI surfacing

Minor addition — the project detail view should surface:

- A badge or tag indicating "Injected from Context" (versus "Planned from issue").
- The `context_spec_id` (clickable if you have a Context URL — make it configurable via `CONTEXT_BASE_URL` env var, defaulting to unset, which renders the id as plain text).
- The `adapter_version` and `target_schema_version` in a details section.
- A link to the archived translation notes evidence record.

If RedDwarf doesn't have a web UI and this is an API-only operator surface today, skip this section and document it as a follow-up ticket.

---

## Feature flag

If RedDwarf has a feature-flag system, gate this endpoint behind a flag (default off) for the first few deploys. If not, skip — the endpoint is protected by `REDDWARF_OPERATOR_TOKEN` and can simply exist.

Env var if flagged:

```
REDDWARF_PROJECTS_INJECT_ENABLED=false
```

When `false`, the route returns 404 (not 403 — we're pretending it doesn't exist).

---

## Tests

### Unit

- Request body validation: every required field, every type, the idempotency shape.
- Provenance table upsert logic under race conditions (two simultaneous requests with the same key — one wins, one sees the dedup response).
- Error mapping: each failure mode maps to the correct status code and error body shape.

### Integration

- Full happy path: valid ProjectSpec, valid provenance → 201, project queryable via existing project read endpoints, provenance record exists, translation notes evidence exists.
- Invalid ProjectSpec → 422 with Zod paths.
- Missing auth → 401.
- Wrong token → 401.
- Idempotent resubmit (same spec id + version) → 200 with `deduplicated: true` and identical `project_id`.
- Idempotent resubmit after approval → 200 with `deduplicated: true` and current state.
- Idempotent resubmit after cancellation → 409.
- Schema-version mismatch in provenance (`target_schema_version` doesn't match current RedDwarf schema) → log a warning, proceed. Archival captures the mismatch for audit. Do not reject — the adapter pinning is an informational signal, not a policy gate.

### End-to-end

The "Done when" criterion below implies a full round-trip:

1. Start Context, run a conversation to a reasonable threshold, produce a canonical spec.
2. Trigger T-08's "Send to RedDwarf" action (feature flag flipped on).
3. Context calls `POST /projects/inject`.
4. RedDwarf returns 201 with the new project id.
5. The project appears in RedDwarf's pending-approval queue.
6. An operator approves it through the existing flow.
7. The existing pipeline dispatches it to the Architect, Developer, Validation, Review, SCM phases.
8. A PR is opened.

All of that works unchanged from how a Project Mode planning run would reach the same state. If any gate in RedDwarf treats an injected project differently from a planned project, that's a bug — fix it or document the divergence clearly.

---

## Config

Add to `.env.example` in canonical order with comments:

```
# -- Context integration ------------------------------------------------------
# Optional. Set to false to disable the POST /projects/inject operator route.
REDDWARF_PROJECTS_INJECT_ENABLED=true
# Optional. If set, the operator UI links context_spec_id back to Context.
# Example: https://context.example.com
CONTEXT_BASE_URL=
```

No new secrets. The existing `REDDWARF_OPERATOR_TOKEN` covers auth.

---

## Done when

- `POST /projects/inject` exists on the operator API, documented and tested.
- A valid ProjectSpec produced by T-09's adapter (from a real Context conversation) injects cleanly and appears in RedDwarf's pending-approval queue.
- The existing approval UI can approve the project; the existing pipeline runs development, validation, review, and SCM phases; a PR is opened.
- Re-posting the same `(context_spec_id, context_version)` returns 200 with `deduplicated: true`, not a second project.
- Invalid ProjectSpec returns 422 with readable Zod paths.
- Translation notes are archived to evidence and discoverable from the project.
- Provenance is visible in the operator UI (if applicable).
- `pnpm test` (or RedDwarf's equivalent verify scripts) passes with the new tests.
- PR description documents: every file touched, every migration added, the exact operator flow for approving an injected project, and any divergences between injected and planned projects.

---

## Non-negotiables

- RedDwarf repo only. No Context imports, no Context env vars.
- Injected projects reach `pending_approval` via the same persistence path as a planning run. No parallel pipeline.
- Idempotent on `(context_spec_id, context_version)`. Hard DB constraint, not application-level dedup.
- Translation notes go to the evidence plane, not the provenance table.
- No change to approval logic. The approval flow is already correct for planning-run projects; injected projects inherit it.
- `REDDWARF_OPERATOR_TOKEN` auth on every request. No bypass.
- Follow RedDwarf's existing conventions (logging, error shapes, pg pool, migration scripts). Don't introduce new patterns.
- TypeScript strict. Zod-validate the request body.
- `.env.example` updated in canonical order with comments.

---

## Out of scope

Push back if asked to add any of these:

- Bidirectional sync.
- Webhooks or SSE for approval decisions.
- Batch injection.
- An async injection queue.
- Injection of partially-complete specs (below Context's completeness threshold). Context's UI prevents this; don't duplicate the check here.
- A `PUT /projects/inject` or `PATCH /projects/inject/:id` for updating an injected project. If the user wants to revise, they bump `context_version` in Context and re-inject — that's what the version number is for.
- Notifications beyond what RedDwarf's existing approval queue already fires.
- Analytics on injection rates, times, or outcomes. Observability follows RedDwarf's existing metrics model.

---

## Decisions deferred to you during implementation

Flag these in the PR description:

- Exact table name and schema for the provenance table. Follow RedDwarf's migration conventions.
- Whether idempotent resubmits return 200 or 202 (both are defensible). I'd pick 200 for clarity.
- Whether the operator UI surfacing is part of this ticket or a follow-up. If RedDwarf doesn't have a web UI yet, definitely a follow-up.
- Whether the feature flag is used or the endpoint ships on by default. If RedDwarf has a flag system, use it for the first few deploys.
- How RedDwarf's existing pipeline distinguishes (if at all) between injected and planned projects. Ideally they're indistinguishable post-approval; if they're not, document why.


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
