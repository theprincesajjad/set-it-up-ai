-- phase-solo workstream B: address visibility for home-based and mobile pros (solo-pro-launch.md §2.3) and where the owner works.
-- Existing locations stay exact; the public pin (map_lat/map_lng) is filled on write, and read falls back to lat/lng for exact.
ALTER TABLE "locations" ADD COLUMN "address_visibility" text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "area_label" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "map_lat" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "map_lng" double precision;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "work_setting" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "service_radius_km" integer;