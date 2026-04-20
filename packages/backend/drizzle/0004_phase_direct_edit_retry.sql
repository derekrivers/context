ALTER TABLE "context"."conversation_turns" DROP CONSTRAINT IF EXISTS "conversation_turns_phase_check";--> statement-breakpoint
ALTER TABLE "context"."conversation_turns" ADD CONSTRAINT "conversation_turns_phase_check" CHECK ("phase" IN ('selection', 'answer', 'clarification', 'skip', 'unskip', 'direct_edit', 'retry_request'));
