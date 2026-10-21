CREATE TABLE "outbound_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status_code" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "sms_receipts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD COLUMN "created_via" text DEFAULT 'dashboard' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "status" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "purchase_ref" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "purchase" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "claim_code" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbound_webhook_deliveries" ADD CONSTRAINT "outbound_webhook_deliveries_webhook_id_outbound_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."outbound_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_deliveries" ADD CONSTRAINT "outbound_webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_deliveries_due_idx" ON "outbound_webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbound_deliveries_webhook_idx" ON "outbound_webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_events_merchant_status_idx" ON "webhook_events" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "webhook_events_claim_idx" ON "webhook_events" USING btree ("merchant_id","claim_code");