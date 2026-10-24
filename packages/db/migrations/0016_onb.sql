CREATE TABLE "merchant_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "merchant_milestones" ADD CONSTRAINT "merchant_milestones_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_milestones_uq" ON "merchant_milestones" USING btree ("merchant_id","key");--> statement-breakpoint
CREATE INDEX "merchant_milestones_key_idx" ON "merchant_milestones" USING btree ("key","reached_at");--> statement-breakpoint
-- Backfill the funnel for shops that signed up before milestones existed.
INSERT INTO "merchant_milestones" ("merchant_id", "key", "reached_at") SELECT "id", 'signed_up', "created_at" FROM "merchants" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "merchant_milestones" ("merchant_id", "key", "reached_at") SELECT "merchant_id", 'first_stamp', min("created_at") FROM "visits" GROUP BY "merchant_id" ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "merchant_milestones" ("merchant_id", "key", "reached_at") SELECT "id", 'activated', "activated_at" FROM "merchants" WHERE "activated_at" IS NOT NULL ON CONFLICT DO NOTHING;
