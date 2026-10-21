CREATE TYPE "public"."ad_placement" AS ENUM('feed_top', 'search_top', 'map_pin', 'promo_boost', 'nearby_push');--> statement-breakpoint
CREATE TYPE "public"."ad_status" AS ENUM('draft', 'pending_review', 'active', 'paused', 'ended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."earn_type" AS ENUM('per_dollar', 'per_visit', 'stamps');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('square', 'clover', 'shopify', 'lightspeed', 'toast', 'stripe', 'twilio', 'google_business', 'mailchimp', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('pending', 'connected', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."join_source" AS ENUM('qr', 'phone', 'pos', 'wallet', 'referral', 'app', 'import', 'web', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('member', 'merchant_issued', 'merchant_redeemed', 'network_issued');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('onboarding', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('sms', 'email', 'push');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."neighbourhood_status" AS ENUM('scouting', 'pilot', 'live');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'accepted', 'preparing', 'ready', 'picked_up', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'requires_action', 'authorized', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_id" AS ENUM('free', 'plus', 'pro');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('none', 'rep', 'admin');--> statement-breakpoint
CREATE TYPE "public"."promo_kind" AS ENUM('offer', 'multiplier', 'bonus_points', 'discount', 'event');--> statement-breakpoint
CREATE TYPE "public"."promo_status" AS ENUM('draft', 'scheduled', 'live', 'ended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'approved', 'declined', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."reward_type" AS ENUM('amount_off', 'percent_off', 'free_item', 'custom');--> statement-breakpoint
CREATE TYPE "public"."rollout_stage" AS ENUM('hidden', 'beta', 'ga');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('intake', 'diagnosing', 'quote_sent', 'approved', 'declined', 'in_progress', 'waiting_parts', 'ready', 'picked_up', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tx_source" AS ENUM('dashboard', 'staff_app', 'customer_app', 'square', 'clover', 'shopify', 'lightspeed', 'toast', 'api', 'system', 'import');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('earn', 'redeem', 'adjust', 'welcome_bonus', 'birthday_bonus', 'referral_bonus', 'promo_bonus', 'network_bonus', 'campaign_bonus', 'reversal', 'expire', 'import');--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"placement" "ad_placement" NOT NULL,
	"promo_id" uuid,
	"neighbourhood_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"radius_metres" integer,
	"headline" text NOT NULL,
	"body" text,
	"image_url" text,
	"pricing_model" text DEFAULT 'daily' NOT NULL,
	"rate_cents" integer NOT NULL,
	"budget_cents" integer NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "ad_status" DEFAULT 'draft' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"attributed_visits" integer DEFAULT 0 NOT NULL,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_campaign_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"merchant_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"data" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid,
	"kind" text DEFAULT 'pickup' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ticket_id" uuid,
	"order_id" uuid,
	"status" text DEFAULT 'booked' NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_merchants" (
	"campaign_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	CONSTRAINT "campaign_merchants_campaign_id_merchant_id_pk" PRIMARY KEY("campaign_id","merchant_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_progress" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_progress_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'passport' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"goal_visits" integer DEFAULT 5 NOT NULL,
	"bonus_points" integer DEFAULT 0 NOT NULL,
	"multiplier_pct" integer,
	"prize" text,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"image_url" text,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"orderable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"percent_off" integer DEFAULT 0 NOT NULL,
	"amount_off_cents" integer DEFAULT 0 NOT NULL,
	"terms" text,
	"eligibility" text DEFAULT 'members_only' NOT NULL,
	"excluded_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_overrides" (
	"merchant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_overrides_merchant_id_key_pk" PRIMARY KEY("merchant_id","key")
);
--> statement-breakpoint
CREATE TABLE "feature_rollouts" (
	"key" text PRIMARY KEY NOT NULL,
	"stage" "rollout_stage" NOT NULL,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'pending' NOT NULL,
	"external_account_id" text,
	"credentials_enc" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"ticket_id" uuid,
	"number" integer NOT NULL,
	"line_items" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"deposit_applied_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"amount_due_cents" integer NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"pay_token" text NOT NULL,
	"stripe_payment_intent_id" text,
	"paid_at" timestamp with time zone,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"rep_user_id" uuid,
	"kind" text NOT NULL,
	"outcome" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid,
	"business_name" text NOT NULL,
	"vertical" text,
	"address" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"current_loyalty" text,
	"assigned_rep_id" uuid,
	"merchant_id" uuid,
	"next_action_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"kind" "ledger_account_kind" NOT NULL,
	"member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"location_id" uuid,
	"type" "tx_type" NOT NULL,
	"source" "tx_source" NOT NULL,
	"points" integer NOT NULL,
	"amount_cents" integer,
	"eligible_cents" integer,
	"description" text,
	"breakdown" jsonb,
	"idempotency_key" text,
	"external_ref" text,
	"staff_user_id" uuid,
	"reverses_transaction_id" uuid,
	"reversed_at" timestamp with time zone,
	"promo_id" uuid,
	"reward_id" uuid,
	"campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT 'Toronto' NOT NULL,
	"postal_code" text,
	"lat" double precision,
	"lng" double precision,
	"phone" text,
	"hours" jsonb,
	"qr_code" text NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"earn_type" "earn_type" DEFAULT 'per_dollar' NOT NULL,
	"points_per_dollar" integer DEFAULT 1 NOT NULL,
	"points_per_visit" integer DEFAULT 0 NOT NULL,
	"min_spend_cents" integer DEFAULT 0 NOT NULL,
	"stamp_goal" integer DEFAULT 0 NOT NULL,
	"terminology" text DEFAULT 'points' NOT NULL,
	"welcome_bonus" integer DEFAULT 0 NOT NULL,
	"birthday_bonus" integer DEFAULT 0 NOT NULL,
	"referral_bonus" integer DEFAULT 0 NOT NULL,
	"expiry_months" integer,
	"visit_cooldown_minutes" integer DEFAULT 30 NOT NULL,
	"terms_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"earn_eligible" boolean DEFAULT true NOT NULL,
	"discount_eligible" boolean DEFAULT true NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_counters" (
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "merchant_counters_merchant_id_name_pk" PRIMARY KEY("merchant_id","name")
);
--> statement-breakpoint
CREATE TABLE "merchant_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_via" "join_source" DEFAULT 'phone' NOT NULL,
	"joined_location_id" uuid,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"total_spend_cents" bigint DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"vip_level_id" uuid,
	"marketing_consent_at" timestamp with time zone,
	"marketing_consent_source" text,
	"marketing_consent_text" text,
	"muted" boolean DEFAULT false NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"referred_by_member_id" uuid,
	"last_birthday_bonus_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_staff" (
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "staff_role" DEFAULT 'staff' NOT NULL,
	"pin_hash" text,
	"permissions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_staff_merchant_id_user_id_pk" PRIMARY KEY("merchant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vertical" text NOT NULL,
	"description" text,
	"neighbourhood_id" uuid,
	"status" "merchant_status" DEFAULT 'onboarding' NOT NULL,
	"plan" "plan_id" DEFAULT 'free' NOT NULL,
	"beta_opt_in" boolean DEFAULT false NOT NULL,
	"email" text,
	"phone" text,
	"website" text,
	"instagram" text,
	"logo_url" text,
	"cover_url" text,
	"brand_color" text,
	"timezone" text DEFAULT 'America/Toronto' NOT NULL,
	"rep_user_id" uuid,
	"activated_at" timestamp with time zone,
	"onboarding_step" text DEFAULT 'profile' NOT NULL,
	"stripe_customer_id" text,
	"stripe_account_id" text,
	"sms_credits_used" integer DEFAULT 0 NOT NULL,
	"api_key_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"user_id" uuid NOT NULL,
	"merchant_id" uuid,
	"channel" "message_channel" NOT NULL,
	"to" text NOT NULL,
	"body" text NOT NULL,
	"kind" text DEFAULT 'marketing' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"segment" jsonb DEFAULT '{"kind":"all"}'::jsonb NOT NULL,
	"automation" text,
	"status" "message_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighbourhoods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"city" text DEFAULT 'Toronto' NOT NULL,
	"province" text DEFAULT 'ON' NOT NULL,
	"status" "neighbourhood_status" DEFAULT 'scouting' NOT NULL,
	"center_lat" double precision,
	"center_lng" double precision,
	"radius_metres" integer DEFAULT 1200 NOT NULL,
	"bia_name" text,
	"bia_contact_name" text,
	"bia_contact_email" text,
	"bia_contact_phone" text,
	"storefront_estimate" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_perk_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"perk_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_perks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"neighbourhood_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text DEFAULT 'distinct_merchants' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"window_days" integer DEFAULT 30 NOT NULL,
	"bonus_points" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_id" uuid
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"pickup_at" timestamp with time zone,
	"notes" text,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"stripe_payment_intent_id" text,
	"redemption_id" uuid,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"ready_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" text DEFAULT 'login' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"image_url" text,
	"kind" "promo_kind" DEFAULT 'offer' NOT NULL,
	"multiplier_pct" integer,
	"bonus_points" integer,
	"percent_off" integer,
	"item_id" uuid,
	"category_id" uuid,
	"days_of_week" jsonb,
	"start_time" text,
	"end_time" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"audience" text DEFAULT 'network' NOT NULL,
	"status" "promo_status" DEFAULT 'draft' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"claim_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"line_items" jsonb NOT NULL,
	"diagnosis" text,
	"subtotal_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"deposit_cents" integer DEFAULT 0 NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"approval_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"signature_name" text,
	"signature_ip" text,
	"signature_user_agent" text,
	"decline_reason" text,
	"deposit_payment_intent_id" text,
	"deposit_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"transaction_id" uuid,
	"code" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"discount_cents" integer,
	"used_at" timestamp with time zone,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"referrer_member_id" uuid NOT NULL,
	"code" text NOT NULL,
	"referee_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"points_cost" integer NOT NULL,
	"reward_type" "reward_type" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"max_discount_cents" integer,
	"catalog_item_id" uuid,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"location_id" uuid,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"item_kind" text DEFAULT 'device' NOT NULL,
	"item_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issue" text NOT NULL,
	"intake_notes" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "ticket_status" DEFAULT 'intake' NOT NULL,
	"assigned_staff_id" uuid,
	"promised_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"plan" "plan_id" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"status" "ticket_status",
	"note" text,
	"visible_to_customer" boolean DEFAULT true NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text,
	"name" text,
	"password_hash" text,
	"platform_role" "platform_role" DEFAULT 'none' NOT NULL,
	"birthday" date,
	"postal_code" text,
	"home_neighbourhood_id" uuid,
	"locale" text DEFAULT 'en-CA' NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"member_code" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vip_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"threshold_points" integer NOT NULL,
	"multiplier_pct" integer DEFAULT 100 NOT NULL,
	"perks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid,
	"transaction_id" uuid,
	"neighbourhood_id" uuid,
	"source" "tx_source" NOT NULL,
	"amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_device_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_library_id" text NOT NULL,
	"push_token" text NOT NULL,
	"pass_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"serial_number" text NOT NULL,
	"auth_token" text NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"merchant_id" uuid,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_promo_id_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."promos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_ad_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("ad_campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_slot_id_booking_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."booking_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_merchants" ADD CONSTRAINT "campaign_merchants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_merchants" ADD CONSTRAINT "campaign_merchants_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_progress" ADD CONSTRAINT "campaign_progress_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_progress" ADD CONSTRAINT "campaign_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_merchant_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."merchant_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_cards" ADD CONSTRAINT "discount_cards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_overrides" ADD CONSTRAINT "feature_overrides_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_rollouts" ADD CONSTRAINT "feature_rollouts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_rep_user_id_users_id_fk" FOREIGN KEY ("rep_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_rep_id_users_id_fk" FOREIGN KEY ("assigned_rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_categories" ADD CONSTRAINT "merchant_categories_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_counters" ADD CONSTRAINT "merchant_counters_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_joined_location_id_locations_id_fk" FOREIGN KEY ("joined_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_members" ADD CONSTRAINT "merchant_members_vip_level_id_vip_levels_id_fk" FOREIGN KEY ("vip_level_id") REFERENCES "public"."vip_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_staff" ADD CONSTRAINT "merchant_staff_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_staff" ADD CONSTRAINT "merchant_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_rep_user_id_users_id_fk" FOREIGN KEY ("rep_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_perk_awards" ADD CONSTRAINT "network_perk_awards_perk_id_network_perks_id_fk" FOREIGN KEY ("perk_id") REFERENCES "public"."network_perks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_perk_awards" ADD CONSTRAINT "network_perk_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_perk_awards" ADD CONSTRAINT "network_perk_awards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_perk_awards" ADD CONSTRAINT "network_perk_awards_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_perks" ADD CONSTRAINT "network_perks_neighbourhood_id_neighbourhoods_id_fk" FOREIGN KEY ("neighbourhood_id") REFERENCES "public"."neighbourhoods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhooks" ADD CONSTRAINT "outbound_webhooks_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promos" ADD CONSTRAINT "promos_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_member_id_merchant_members_id_fk" FOREIGN KEY ("referrer_member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_user_id_users_id_fk" FOREIGN KEY ("referee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_assigned_staff_id_users_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vip_levels" ADD CONSTRAINT "vip_levels_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_member_id_merchant_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."merchant_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_device_registrations" ADD CONSTRAINT "wallet_device_registrations_pass_id_wallet_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."wallet_passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_passes" ADD CONSTRAINT "wallet_passes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" USING btree ("status","placement");--> statement-breakpoint
CREATE INDEX "ad_events_campaign_idx" ON "ad_events" USING btree ("ad_campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_merchant_idx" ON "audit_logs" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_slots_merchant_idx" ON "booking_slots" USING btree ("merchant_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_slot_idx" ON "bookings" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "catalog_items_merchant_idx" ON "catalog_items" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "discount_cards_merchant_idx" ON "discount_cards" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_merchant_provider_uq" ON "integrations" USING btree ("merchant_id","provider");--> statement-breakpoint
CREATE INDEX "integrations_external_idx" ON "integrations" USING btree ("provider","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_pay_token_uq" ON "invoices" USING btree ("pay_token");--> statement-breakpoint
CREATE INDEX "invoices_merchant_idx" ON "invoices" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "leads_rep_idx" ON "leads" USING btree ("assigned_rep_id","stage");--> statement-breakpoint
CREATE INDEX "leads_neighbourhood_idx" ON "leads" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_member_uq" ON "ledger_accounts" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_merchant_kind_uq" ON "ledger_accounts" USING btree ("merchant_id","kind") WHERE "ledger_accounts"."member_id" is null;--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_tx_idem_uq" ON "ledger_transactions" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_tx_member_idx" ON "ledger_transactions" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_tx_merchant_idx" ON "ledger_transactions" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "locations_merchant_idx" ON "locations" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_qr_uq" ON "locations" USING btree ("qr_code");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_programs_merchant_uq" ON "loyalty_programs" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "merchant_categories_merchant_idx" ON "merchant_categories" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_members_uq" ON "merchant_members" USING btree ("merchant_id","user_id");--> statement-breakpoint
CREATE INDEX "merchant_members_user_idx" ON "merchant_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "merchant_members_last_visit_idx" ON "merchant_members" USING btree ("merchant_id","last_visit_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchants_slug_uq" ON "merchants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "merchants_neighbourhood_idx" ON "merchants" USING btree ("neighbourhood_id");--> statement-breakpoint
CREATE INDEX "message_deliveries_message_idx" ON "message_deliveries" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_merchant_idx" ON "messages" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "neighbourhoods_slug_uq" ON "neighbourhoods" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "network_perk_awards_uq" ON "network_perk_awards" USING btree ("perk_id","user_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_idx" ON "orders" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_target_idx" ON "otp_codes" USING btree ("target");--> statement-breakpoint
CREATE INDEX "promos_merchant_idx" ON "promos" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "promos_window_idx" ON "promos" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_uq" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_token_uq" ON "quotes" USING btree ("approval_token");--> statement-breakpoint
CREATE INDEX "quotes_ticket_idx" ON "quotes" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_code_uq" ON "redemptions" USING btree ("merchant_id","code");--> statement-breakpoint
CREATE INDEX "redemptions_member_idx" ON "redemptions" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_code_uq" ON "referrals" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rewards_merchant_idx" ON "rewards" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "service_tickets_merchant_idx" ON "service_tickets" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "service_tickets_user_idx" ON "service_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_merchant_idx" ON "subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_uq" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_member_code_uq" ON "users" USING btree ("member_code");--> statement-breakpoint
CREATE INDEX "vip_levels_merchant_idx" ON "vip_levels" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "visits_merchant_idx" ON "visits" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "visits_user_idx" ON "visits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "visits_neighbourhood_idx" ON "visits" USING btree ("neighbourhood_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_device_reg_uq" ON "wallet_device_registrations" USING btree ("device_library_id","pass_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_passes_serial_uq" ON "wallet_passes" USING btree ("serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_uq" ON "webhook_events" USING btree ("provider","external_id");