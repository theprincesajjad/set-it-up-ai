ALTER TABLE "catering_events" ADD COLUMN "deposit_refund_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "deposit_refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "deposit_refund_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "deposit_refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "halls" ADD COLUMN "refund_policy" jsonb DEFAULT '{"tiers":[{"minDaysBefore":30,"refundBps":10000},{"minDaysBefore":14,"refundBps":5000}]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD COLUMN "payment_method_brand" text;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD COLUMN "payment_method_last4" text;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD COLUMN "setup_intent_id" text;