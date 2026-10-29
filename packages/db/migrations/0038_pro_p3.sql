-- phase-pro P3: regulars come back. Rebooking mode per shop, and the appointment a nudge led to. docs/business/pro-value.md §3.2 P3
ALTER TABLE "merchants" ADD COLUMN "rebooking_mode" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "rebooking_nudges" ADD COLUMN "booked_appointment_id" uuid;--> statement-breakpoint
UPDATE "merchants" SET "rebooking_mode" = 'auto' WHERE "rebook_auto" = true;
