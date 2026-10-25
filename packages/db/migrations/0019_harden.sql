CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wallet_passes_user_idx" ON "wallet_passes" USING btree ("user_id");