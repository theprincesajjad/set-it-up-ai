CREATE TABLE "sales_agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"contact_key" text NOT NULL,
	"phone" text,
	"contact_name" text,
	"language" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"page" text,
	"turn" integer DEFAULT 0 NOT NULL,
	"pending_action" jsonb,
	"otp_phone" text,
	"otp_sent_at" timestamp with time zone,
	"verified_phone" text,
	"verified_user_id" uuid,
	"verified_at" timestamp with time zone,
	"lead_id" uuid,
	"handoff_reason" text,
	"handoff_at" timestamp with time zone,
	"taken_over_by" uuid,
	"taken_over_at" timestamp with time zone,
	"call_request_at" timestamp with time zone,
	"call_request_note" text,
	"disclosed_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback" text,
	"guard" text,
	"human_user_id" uuid,
	"model" text,
	"usage" jsonb,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_agent_conversations" ADD CONSTRAINT "sales_agent_conversations_verified_user_id_users_id_fk" FOREIGN KEY ("verified_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_agent_conversations" ADD CONSTRAINT "sales_agent_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_agent_conversations" ADD CONSTRAINT "sales_agent_conversations_taken_over_by_users_id_fk" FOREIGN KEY ("taken_over_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_agent_messages" ADD CONSTRAINT "sales_agent_messages_conversation_id_sales_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."sales_agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_agent_messages" ADD CONSTRAINT "sales_agent_messages_human_user_id_users_id_fk" FOREIGN KEY ("human_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_agent_conv_contact_uq" ON "sales_agent_conversations" USING btree ("channel","contact_key");--> statement-breakpoint
CREATE INDEX "sales_agent_conv_status_idx" ON "sales_agent_conversations" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "sales_agent_conv_activity_idx" ON "sales_agent_conversations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "sales_agent_msg_conv_idx" ON "sales_agent_messages" USING btree ("conversation_id","created_at");