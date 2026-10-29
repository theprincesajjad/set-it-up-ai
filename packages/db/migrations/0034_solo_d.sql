-- phase-solo workstream D: the people side (docs/business/people-side.md): inbox threads and messages, web push, promo templates, Instagram (read-only), visit note and intake on appointments, channel and language per customer.
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"channel" text,
	"sent_by_user_id" uuid,
	"provider_message_id" text,
	"external_message_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid,
	"channel" text NOT NULL,
	"external_id" text,
	"display_name" text,
	"handle" text,
	"last_message_at" timestamp with time zone,
	"unread" integer DEFAULT 0 NOT NULL,
	"instagram_thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text,
	"token_encrypted" text,
	"provider" text DEFAULT 'instagram' NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade" text NOT NULL,
	"season" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"window" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "visit_note" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "visit_photo_url" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "intake_answer" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD COLUMN "channel_pref" text DEFAULT 'best' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "intake_question" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_push_subscriptions" ADD CONSTRAINT "web_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_thread_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_external_uq" ON "conversation_messages" USING btree ("conversation_id","external_message_id") WHERE "conversation_messages"."external_message_id" is not null;--> statement-breakpoint
CREATE INDEX "conversations_merchant_last_idx" ON "conversations" USING btree ("merchant_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_uq" ON "conversations" USING btree ("merchant_id","user_id") WHERE "conversations"."user_id" is not null and "conversations"."channel" <> 'instagram';--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_external_uq" ON "conversations" USING btree ("merchant_id","channel","external_id") WHERE "conversations"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "instagram_connections_merchant_idx" ON "instagram_connections" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "instagram_connections_ig_user_idx" ON "instagram_connections" USING btree ("ig_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_templates_key_uq" ON "promo_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "promo_templates_trade_idx" ON "promo_templates" USING btree ("trade");--> statement-breakpoint
CREATE UNIQUE INDEX "web_push_subscriptions_endpoint_uq" ON "web_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "web_push_subscriptions_user_idx" ON "web_push_subscriptions" USING btree ("user_id");