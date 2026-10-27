ALTER TABLE "appointments" ADD COLUMN "pet_id" uuid;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "last_reminder_key" text;--> statement-breakpoint
ALTER TABLE "catering_events" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "pharmacy_ocp_number" text;--> statement-breakpoint
ALTER TABLE "tiffin_subscriptions" ADD COLUMN "billing_cadence" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "loyalty_programs" SET "welcome_bonus" = 0 WHERE "merchant_id" IN (SELECT "id" FROM "merchants" WHERE "vertical" = 'pharmacy');
