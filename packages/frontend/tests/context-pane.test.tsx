import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CompletenessReport } from '@context/spec-schema'
import { CompletenessBlock } from '../src/components/authoring/context/CompletenessBlock.js'
import {
  deriveNextAction,
  NextActionCard,
} from '../src/components/authoring/context/NextActionCard.js'
import { UnresolvedList } from '../src/components/authoring/context/UnresolvedList.js'
import { ActivityFeed } from '../src/components/authoring/context/ActivityFeed.js'
import { AuthoringProvider, AuthoringReadOnlyProvider } from '../src/contexts/AuthoringContexts.js'
import type { TurnRow, UnresolvedEntry } from '../src/queries/authoring.js'

function report(overrides: Partial<Record<string, number>> = {}): CompletenessReport {
  const scores = {
    intent: 0.5,
    domain_model: 0.3,
    capabilities: 0,
    flows: 0,
    constraints: 0,
    references: 0,
    ...overrides,
  }
  return {
    overall: 0.2,
    bySection: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [
        k,
        { section: k as 'intent', score: v, present: v > 0 ? 1 : 0, total: 1 },
      ]),
    ) as CompletenessReport['bySection'],
    missingPrioritized: [],
    nextField: null,
  }
}

describe('CompletenessBlock', () => {
  afterEach(cleanup)

  it('renders the overall percent and section bars', () => {
    render(<CompletenessBlock report={report()} />)
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByLabelText(/intent:/)).toBeInTheDocument()
    expect(screen.getByLabelText(/domain model:/)).toBeInTheDocument()
  })

  it('invokes onSectionClick when a bar is clicked', () => {
    const onSectionClick = vi.fn()
    render(<CompletenessBlock report={report()} onSectionClick={onSectionClick} />)
    fireEvent.click(screen.getByLabelText(/domain model:/))
    expect(onSectionClick).toHaveBeenCalledWith('domain_model')
  })
})

describe('deriveNextAction', () => {
  const base = {
    onReviewUnresolved: vi.fn(),
    onJumpConversation: vi.fn(),
    onExport: vi.fn(),
  }

  it('returns turn_cap when the cap is reached', () => {
    const s = deriveNextAction({ ...base, report: report(), turns: [], unresolvedCount: 0, turnCapReached: true })
    expect(s.kind).toBe('turn_cap')
  })

  it('returns complete when every section meets its threshold', () => {
    const r = report({
      intent: 1,
      domain_model: 1,
      capabilities: 1,
      flows: 1,
      constraints: 1,
      references: 1,
    })
    const s = deriveNextAction({ ...base, report: r, turns: [], unresolvedCount: 0, turnCapReached: false })
    expect(s.kind).toBe('complete')
  })

  it('returns unresolved when below threshold with unresolved entries', () => {
    const s = deriveNextAction({
      ...base,
      report: report(),
      turns: [],
      unresolvedCount: 2,
      turnCapReached: false,
    })
    expect(s.kind).toBe('unresolved')
  })
})

function fakeTurn(overrides: Partial<TurnRow> = {}): TurnRow {
  return {
    id: crypto.randomUUID(),
    spec_id: '11111111-1111-4111-8111-111111111111',
    turn_index: 0,
    created_at: new Date().toISOString(),
    phase: 'selection',
    target_path: 'intent.summary',
    target_section: 'intent',
    selection_reason: null,
    outcome: null,
    llm_model_id: null,
    llm_tokens_in: null,
    llm_tokens_out: null,
    question_text: null,
    user_text: null,
    ...overrides,
  }
}

function fakeUnresolved(path: string): UnresolvedEntry {
  return {
    path,
    section: path.split('.')[0] ?? null,
    last_asked_at: new Date().toISOString(),
    last_question: 'What about this?',
    reason: 'retry_budget_exhausted',
    retries_attempted: 3,
  }
}

describe('UnresolvedList', () => {
  afterEach(cleanup)

  it('renders empty state when no entries', () => {
    render(
      <AuthoringReadOnlyProvider value={{ readOnly: false, reason: null }}>
        <UnresolvedList
          entries={[]}
          onRetry={vi.fn()}
          onMarkUnanswerable={vi.fn()}
          onNavigate={vi.fn()}
          retryPending={false}
          markPending={false}
        />
      </AuthoringReadOnlyProvider>,
    )
    expect(screen.getByText('Nothing unresolved.')).toBeInTheDocument()
  })

  it('fires retry with the correct path', () => {
    const onRetry = vi.fn()
    render(
      <AuthoringReadOnlyProvider value={{ readOnly: false, reason: null }}>
        <UnresolvedList
          entries={[fakeUnresolved('intent.summary')]}
          onRetry={onRetry}
          onMarkUnanswerable={vi.fn()}
          onNavigate={vi.fn()}
          retryPending={false}
          markPending={false}
        />
      </AuthoringReadOnlyProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledWith('intent.summary')
  })

  it('hides action buttons when read-only', () => {
    render(
      <AuthoringReadOnlyProvider value={{ readOnly: true, reason: 'viewer_share' }}>
        <UnresolvedList
          entries={[fakeUnresolved('intent.summary')]}
          onRetry={vi.fn()}
          onMarkUnanswerable={vi.fn()}
          onNavigate={vi.fn()}
          retryPending={false}
          markPending={false}
        />
      </AuthoringReadOnlyProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('ActivityFeed', () => {
  afterEach(cleanup)

  it('renders one row per turn with a phase label', () => {
    render(
      <AuthoringProvider
        value={{ activeTargetPath: null, activeSection: null, activeSelectionTurnId: null }}
      >
        <ActivityFeed
          turns={[
            fakeTurn({ phase: 'direct_edit', target_path: 'intent.summary' }),
            fakeTurn({ phase: 'answer', target_path: 'intent.problem' }),
          ]}
          onNavigate={vi.fn()}
        />
      </AuthoringProvider>,
    )
    expect(screen.getByText('Edited directly')).toBeInTheDocument()
    expect(screen.getByText('Answered')).toBeInTheDocument()
  })

  it('highlights the active target row', () => {
    const turn = fakeTurn({ phase: 'selection', target_path: 'intent.summary' })
    render(
      <AuthoringProvider
        value={{
          activeTargetPath: 'intent.summary',
          activeSection: 'intent',
          activeSelectionTurnId: turn.id,
        }}
      >
        <ActivityFeed turns={[turn]} onNavigate={vi.fn()} />
      </AuthoringProvider>,
    )
    const button = screen.getByRole('button', { name: /intent\.summary/ })
    expect(button.className).toMatch(/bg-accent/)
  })
})

describe('NextActionCard render', () => {
  afterEach(cleanup)

  it('renders the label for the active_selection state and fires the callback', () => {
    const onJump = vi.fn()
    render(<NextActionCard state={{ kind: 'active_selection', onJump }} />)
    fireEvent.click(screen.getByText(/Jump to conversation/))
    expect(onJump).toHaveBeenCalled()
  })
})
