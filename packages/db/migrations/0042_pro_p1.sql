-- phase-pro P1: the Studio plan id and the 14-day Pro trial (docs/business/pro-value.md §2.2, §3.2 P1).
ALTER TYPE "public"."plan_id" ADD VALUE IF NOT EXISTS 'studio' BEFORE 'pro';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "trial_plan" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "trial_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "trial_used" boolean DEFAULT false NOT NULL;
