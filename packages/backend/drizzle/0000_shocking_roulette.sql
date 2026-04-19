CREATE SCHEMA "context";
--> statement-breakpoint
CREATE TABLE "context"."conversation_turns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"spec_id" uuid NOT NULL,
	"turn_number" integer NOT NULL,
	"target_field" text NOT NULL,
	"question" text,
	"user_answer" text,
	"field_update" jsonb,
	"model_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"state_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_turns_spec_turn_unique" UNIQUE("spec_id","turn_number")
);
--> statement-breakpoint
CREATE TABLE "context"."spec_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"spec_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"diff" jsonb NOT NULL,
	"spec_json_after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context"."specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"schema_version" text NOT NULL,
	"spec_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" uuid,
	"lock_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "context"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "context"."conversation_turns" ADD CONSTRAINT "conversation_turns_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "context"."specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."spec_history" ADD CONSTRAINT "spec_history_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "context"."specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."spec_history" ADD CONSTRAINT "spec_history_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "context"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."specs" ADD CONSTRAINT "specs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "context"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."specs" ADD CONSTRAINT "specs_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "context"."users"("id") ON DELETE set null ON UPDATE no action;