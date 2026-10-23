ALTER TABLE "catering_events" ADD COLUMN "deposit_processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hall_bookings" ADD COLUMN "deposit_processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "deposit_processing_at" timestamp with time zone;