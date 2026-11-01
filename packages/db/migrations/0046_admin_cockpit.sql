-- Wave N, team admin: landing attribution on the shop (signup carries ll_aid / ll_v / src, GPC and ll_aid=off respected client side),
-- UTM on landing events, and the in-process API latency recorder's rolled-up rows (no PII: route templates and counts only).
ALTER TABLE "landing_events" ADD COLUMN "utm_source" text;--> statement-breakpoint
ALTER TABLE "landing_events" ADD COLUMN "utm_medium" text;--> statement-breakpoint
ALTER TABLE "landing_events" ADD COLUMN "utm_campaign" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_anon_id" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_page" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_variant" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_experiment_id" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_src" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_utm_source" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_utm_medium" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_utm_campaign" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "signup_device" text;--> statement-breakpoint
CREATE TABLE "api_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"route_group" text NOT NULL,
	"route" text NOT NULL,
	"count" integer NOT NULL,
	"errors" integer NOT NULL,
	"sum_ms" double precision NOT NULL,
	"max_ms" double precision NOT NULL,
	"hist" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_metrics_bucket_idx" ON "api_metrics" USING btree ("bucket_start");--> statement-breakpoint
CREATE INDEX "landing_events_anon_idx" ON "landing_events" USING btree ("anon_id","created_at");--> statement-breakpoint
CREATE INDEX "merchants_signup_anon_idx" ON "merchants" USING btree ("signup_anon_id");
