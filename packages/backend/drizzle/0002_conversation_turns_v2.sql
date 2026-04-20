DROP TABLE "context"."conversation_turns";--> statement-breakpoint
CREATE TABLE "context"."conversation_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_id" uuid NOT NULL,
	"turn_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phase" text NOT NULL,
	"target_path" text,
	"target_section" text,
	"selection_reason" jsonb,
	"spec_snapshot" jsonb,
	"completeness_snapshot" jsonb,
	"outcome" text,
	"llm_model_id" text,
	"llm_tokens_in" integer,
	"llm_tokens_out" integer,
	CONSTRAINT "conversation_turns_spec_turn_unique" UNIQUE("spec_id","turn_index"),
	CONSTRAINT "conversation_turns_phase_check" CHECK ("phase" IN ('selection', 'answer', 'clarification', 'skip', 'unskip'))
);
--> statement-breakpoint
ALTER TABLE "context"."conversation_turns" ADD CONSTRAINT "conversation_turns_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "context"."specs"("id") ON DELETE cascade ON UPDATE no action;
