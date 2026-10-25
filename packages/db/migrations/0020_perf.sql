CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"order_key" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"merchant_id" uuid,
	"payload" jsonb NOT NULL,
	"steps_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_uq" ON "outbox_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_events_open_idx" ON "outbox_events" USING btree ("order_key","seq") WHERE "outbox_events"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_idx" ON "rate_limit_counters" USING btree ("expires_at");