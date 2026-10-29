-- phase-solo workstream A: plans, promo allowance, annual site entitlement, founding solo price, direct charges default.
-- New shops default to Stripe direct charges; existing shops keep the mode they have (the column already exists).
ALTER TABLE "merchants" ALTER COLUMN "charge_mode" SET DEFAULT 'direct';--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "promos_sent_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "promos_sent_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "annual_site_entitled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "founding_solo" boolean DEFAULT false NOT NULL;
