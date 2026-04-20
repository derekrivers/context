import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useAnswerTurn,
  useNextTurn,
  usePhraseTurn,
  useSkipTurn,
  useTurns,
  useUnskipTurn,
  type AnswerResponse,
  type NextTurnResponse,
  type TurnRow,
} from '../../queries/authoring.js'
import { ConversationInput } from './ConversationInput.js'
import { SelectionCard } from './turns/SelectionCard.js'
import { AnswerCard } from './turns/AnswerCard.js'
import { ClarificationCard } from './turns/ClarificationCard.js'
import { ContradictionCard } from './turns/ContradictionCard.js'
import { SkipCard } from './turns/SkipCard.js'
import { UnknownCard } from './turns/UnknownCard.js'
import { TerminalTurnCard } from './TerminalTurnCard.js'
import { useAuthoringReadOnly } from '../../contexts/AuthoringContexts.js'

export interface ConversationPaneProps {
  specId: string
}

type TerminalState =
  | { kind: 'turn_cap_reached'; used: number; limit: number }
  | { kind: 'token_cap_reached'; used: number; limit: number }
  | null

function latestSelectionWithoutOutcome(turns: TurnRow[]): TurnRow | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (t.phase === 'selection' && t.outcome === null) return t
    if (t.phase === 'selection' && t.outcome !== null) return null
  }
  return null
}

function hasClarificationPending(turns: TurnRow[]): boolean {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (t.phase === 'clarification') return true
    if (t.phase === 'answer') return false
    if (t.phase === 'selection' && t.outcome === null) return true
  }
  return false
}

export function ConversationPane({ specId }: ConversationPaneProps): JSX.Element {
  const turnsQuery = useTurns(specId)
  const nextTurnMutation = useNextTurn(specId)
  const phraseMutation = usePhraseTurn(specId)
  const answerMutation = useAnswerTurn(specId)
  const skipMutation = useSkipTurn(specId)
  const unskipMutation = useUnskipTurn(specId)
  const { readOnly } = useAuthoringReadOnly()

  const [terminal, setTerminal] = useState<TerminalState>(null)
  const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null)
  const [contradiction, setContradiction] = useState<
    | { question: string; path: string; oldValue: unknown; newValue: unknown }
    | null
  >(null)
  const phrasingInFlight = useRef<string | null>(null)

  const scrollEl = useRef<HTMLDivElement | null>(null)
  const userHasScrolledUp = useRef(false)

  const turns = turnsQuery.data?.turns ?? []
  const latestOpenSelection = latestSelectionWithoutOutcome(turns)
  const awaitingAnswer = latestOpenSelection !== null

  useEffect(() => {
    if (readOnly) return
    if (terminal) return
    if (answerMutation.isPending) return
    if (awaitingAnswer) return
    if (nextTurnMutation.isPending) return
    if (!turnsQuery.isSuccess) return

    void nextTurnMutation.mutateAsync().then((outcome) => {
      if (!outcome) return
      if (outcome.kind === 'turn_cap_reached') {
        setTerminal({ kind: 'turn_cap_reached', used: outcome.turn_count, limit: outcome.limit })
        return
      }
      if (outcome.kind === 'token_cap_reached') {
        setTerminal({
          kind: 'token_cap_reached',
          used: outcome.token_count,
          limit: outcome.limit,
        })
        return
      }
      if (outcome.kind === 'selection' && phrasingInFlight.current !== outcome.turn_id) {
        phrasingInFlight.current = outcome.turn_id
        void phraseMutation.mutateAsync(outcome.turn_id).finally(() => {
          phrasingInFlight.current = null
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    readOnly,
    terminal,
    awaitingAnswer,
    turnsQuery.isSuccess,
    turns.length,
    answerMutation.isPending,
  ])

  useEffect(() => {
    if (latestOpenSelection && !latestOpenSelection.question_text && !phrasingInFlight.current) {
      phrasingInFlight.current = latestOpenSelection.id
      void phraseMutation.mutateAsync(latestOpenSelection.id).finally(() => {
        phrasingInFlight.current = null
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestOpenSelection?.id, latestOpenSelection?.question_text])

  useEffect(() => {
    if (userHasScrolledUp.current) return
    const el = scrollEl.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [turns.length, optimisticAnswer, contradiction])

  const onScroll = (): void => {
    const el = scrollEl.current
    if (!el) return
    const nearBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 48
    userHasScrolledUp.current = !nearBottom
  }

  const onSend = async (text: string): Promise<void> => {
    if (!latestOpenSelection) return
    setOptimisticAnswer(text)
    try {
      const result: AnswerResponse = await answerMutation.mutateAsync({
        turnId: latestOpenSelection.id,
        userText: text,
      })
      setOptimisticAnswer(null)
      if (
        result.kind === 'clarification' &&
        result.reason === 'contradicts_existing_spec'
      ) {
        setContradiction({
          question: result.question,
          path: latestOpenSelection.target_path ?? '',
          oldValue: undefined,
          newValue: undefined,
        })
      }
    } catch {
      // keep optimistic state with retry affordance
    }
  }

  const onSkip = async (): Promise<void> => {
    if (!latestOpenSelection) return
    await skipMutation.mutateAsync(latestOpenSelection.id)
  }

  const onUnskip = async (path: string): Promise<void> => {
    await unskipMutation.mutateAsync(path)
  }

  const discardContradiction = (): void => setContradiction(null)
  const onContradictionKeepOld = (): void => {
    discardContradiction()
  }
  const onContradictionUseNew = (): void => {
    discardContradiction()
  }

  const cards = useMemo(() => buildCards(turns, optimisticAnswer, onUnskip), [
    turns,
    optimisticAnswer,
  ])

  const inputPending =
    answerMutation.isPending || skipMutation.isPending || phraseMutation.isPending

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollEl}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {cards}
        {contradiction ? (
          <ContradictionCard
            question={contradiction.question}
            oldValue={contradiction.oldValue}
            newValue={contradiction.newValue}
            path={contradiction.path}
            onKeepOld={onContradictionKeepOld}
            onUseNew={onContradictionUseNew}
            disabled={readOnly}
          />
        ) : null}
        {terminal ? (
          <TerminalTurnCard
            kind={terminal.kind}
            limit={terminal.limit}
            used={terminal.used}
          />
        ) : null}
      </div>
      <ConversationInput
        disabled={readOnly || terminal !== null}
        pending={inputPending || !hasClarificationPending(turns) && !latestOpenSelection}
        onSend={onSend}
        onSkip={onSkip}
        skipDisabled={!latestOpenSelection}
      />
    </div>
  )
}

function buildCards(
  turns: TurnRow[],
  optimisticAnswer: string | null,
  onUnskip: (path: string) => void,
): JSX.Element[] {
  const out: JSX.Element[] = []
  for (const t of turns) {
    if (t.phase === 'selection') {
      out.push(
        <SelectionCard
          key={t.id}
          question={t.question_text ?? null}
          targetPath={t.target_path ?? ''}
          section={t.target_section ?? ''}
          isPhrasing={t.question_text === null || t.question_text === undefined}
        />,
      )
    } else if (t.phase === 'answer') {
      if (t.user_text) {
        out.push(
          <AnswerCard key={t.id} text={t.user_text} />,
        )
      }
    } else if (t.phase === 'clarification') {
      if (t.user_text) {
        out.push(<AnswerCard key={`${t.id}-a`} text={t.user_text} />)
      }
      out.push(
        <ClarificationCard
          key={t.id}
          question={'A follow-up was needed. Please clarify.'}
          reason={t.target_path ? 'clarification_requested' : 'insufficient_detail'}
        />,
      )
    } else if (t.phase === 'skip') {
      const targetPath = t.target_path
      out.push(
        targetPath ? (
          <SkipCard
            key={t.id}
            path={targetPath}
            onUnskip={() => onUnskip(targetPath)}
          />
        ) : (
          <SkipCard key={t.id} path="" />
        ),
      )
    } else if (t.phase === 'unskip') {
      // no visual representation in the feed; unskip just changes the next selection
    }
  }
  if (optimisticAnswer !== null) {
    out.push(<AnswerCard key="optimistic" text={optimisticAnswer} pending />)
  }
  return out
}
