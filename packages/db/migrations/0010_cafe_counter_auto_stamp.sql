ALTER TABLE "loyalty_programs" ADD COLUMN "counter_auto_stamp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD COLUMN "reward_cost_cents" integer;--> statement-breakpoint
-- Existing stamp and per-visit programs at cafés and bakeries stamp on scan (undo stays 10 s). Everyone else stays off.
UPDATE "loyalty_programs" lp SET "counter_auto_stamp" = true
FROM "merchants" m
WHERE m."id" = lp."merchant_id" AND m."vertical" IN ('cafe', 'bakery') AND lp."earn_type" IN ('stamps', 'per_visit');
