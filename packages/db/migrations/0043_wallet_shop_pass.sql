-- Wallet shop passes (docs/engineering/wallet.md): one Apple + Google card per membership, branded by the shop; removal tracking; the shop's wallet card settings.
ALTER TABLE "wallet_passes" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD COLUMN "added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_passes_shop_uq" ON "wallet_passes" USING btree ("user_id","platform","merchant_id") WHERE "merchant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wallet_passes_merchant_idx" ON "wallet_passes" USING btree ("merchant_id");--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "wallet_card" jsonb DEFAULT '{}'::jsonb NOT NULL;
