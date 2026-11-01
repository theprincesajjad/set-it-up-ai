-- Wave N rules: what one stamp is worth (earn unit), what earns (all or selected categories/items/services), a daily cap per customer.
ALTER TABLE "loyalty_programs" ADD COLUMN "earn_unit" text DEFAULT 'visit' NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "earn_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "earn_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "earn_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "earn_service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "max_stamps_per_day" integer;--> statement-breakpoint
UPDATE "loyalty_programs" SET "earn_unit" = 'purchase' WHERE "min_spend_cents" > 0 AND "earn_type" <> 'per_dollar';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_merchant_action_idx" ON "audit_logs" USING btree ("merchant_id","action","created_at");
