ALTER TABLE "merchant_categories" ADD COLUMN "dispensary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "pharmacy_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "pharmacy_confirmed_by_name" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "pharmacy_confirmed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_pharmacy_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("pharmacy_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "merchant_categories" c SET "dispensary" = true, "earn_eligible" = false, "discount_eligible" = false FROM "merchants" m WHERE m."id" = c."merchant_id" AND m."vertical" = 'pharmacy' AND c."name" ~* '(prescription|\yrx\y|dispens|pharmacy services?|pharmacist|medication|medicine|\ydrugs?\y|vaccin|immuni[sz]|injection|compound|blister|pill ?pack|compliance pack|medscheck|narcotic|controlled substance|methadone|clinic|consult)';
