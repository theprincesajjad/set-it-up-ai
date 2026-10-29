-- Landing-page A/B tests: beacon events, looks taken, guardrail inputs, admin ends. packages/shared/src/experiments.ts, docs/marketing/value-props.md §3
CREATE TABLE "experiment_ends" (
	"experiment_id" text PRIMARY KEY NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_id" uuid,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_guardrail_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"variant" text NOT NULL,
	"cost_per_signup_cents" integer NOT NULL,
	"admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_looks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" text NOT NULL,
	"look" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin_id" uuid,
	"snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "landing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anon_id" text NOT NULL,
	"experiment_id" text,
	"variant" text DEFAULT 'control' NOT NULL,
	"page" text NOT NULL,
	"trade" text NOT NULL,
	"src" text,
	"kind" text NOT NULL,
	"data" text,
	"device" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experiment_ends" ADD CONSTRAINT "experiment_ends_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_guardrail_inputs" ADD CONSTRAINT "experiment_guardrail_inputs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_looks" ADD CONSTRAINT "experiment_looks_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "experiment_guardrail_inputs_idx" ON "experiment_guardrail_inputs" USING btree ("experiment_id","variant","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_looks_uq" ON "experiment_looks" USING btree ("experiment_id","look");--> statement-breakpoint
CREATE INDEX "landing_events_exp_idx" ON "landing_events" USING btree ("experiment_id","variant","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_events_once_uq" ON "landing_events" USING btree ("anon_id","experiment_id","kind") WHERE "landing_events"."kind" in ('view', 'start_submit');--> statement-breakpoint
CREATE INDEX "landing_events_created_idx" ON "landing_events" USING btree ("created_at");