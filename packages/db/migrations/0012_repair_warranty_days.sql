ALTER TABLE "merchants" ADD COLUMN "warranty_days" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "balance_reminded_at" timestamp with time zone;