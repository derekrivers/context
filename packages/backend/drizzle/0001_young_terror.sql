CREATE TABLE "context"."spec_shares" (
	"spec_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid NOT NULL,
	CONSTRAINT "spec_shares_spec_id_user_id_pk" PRIMARY KEY("spec_id","user_id"),
	CONSTRAINT "spec_shares_role_check" CHECK ("context"."spec_shares"."role" IN ('viewer', 'editor'))
);
--> statement-breakpoint
ALTER TABLE "context"."spec_shares" ADD CONSTRAINT "spec_shares_spec_id_specs_id_fk" FOREIGN KEY ("spec_id") REFERENCES "context"."specs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."spec_shares" ADD CONSTRAINT "spec_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "context"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context"."spec_shares" ADD CONSTRAINT "spec_shares_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "context"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spec_shares_user_id_idx" ON "context"."spec_shares" USING btree ("user_id");