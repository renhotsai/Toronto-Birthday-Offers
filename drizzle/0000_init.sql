CREATE TYPE "public"."brand_kind" AS ENUM('chain', 'local', 'online');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('food', 'drink', 'dessert', 'beauty', 'retail', 'entertainment', 'other');--> statement-breakpoint
CREATE TYPE "public"."location_source" AS ENUM('osm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."offer_state" AS ENUM('active', 'hidden', 'merged');--> statement-breakpoint
CREATE TYPE "public"."offer_window" AS ENUM('day', 'week', 'month', 'custom');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('not_participating', 'closed', 'wrong_location');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vote_kind" AS ENUM('valid', 'expired');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "brand_kind" NOT NULL,
	"category" "category" NOT NULL,
	"website" text,
	"osm_wikidata" text,
	"osm_name" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "location_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"kind" "report_kind" NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"name" text,
	"address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"source" "location_source" NOT NULL,
	"osm_id" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"hidden_reason" "report_kind",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_votes" (
	"offer_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"kind" "vote_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_votes_offer_id_user_id_pk" PRIMARY KEY("offer_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"title" text NOT NULL,
	"title_zh" text,
	"details" text DEFAULT '' NOT NULL,
	"details_zh" text,
	"conditions" text DEFAULT '' NOT NULL,
	"window" "offer_window" NOT NULL,
	"window_note" text,
	"membership_required" boolean DEFAULT true NOT NULL,
	"official_url" text NOT NULL,
	"state" "offer_state" DEFAULT 'active' NOT NULL,
	"merged_into_id" integer,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_reports" ADD CONSTRAINT "location_reports_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_reports" ADD CONSTRAINT "location_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_reports" ADD CONSTRAINT "location_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_votes" ADD CONSTRAINT "offer_votes_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_votes" ADD CONSTRAINT "offer_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_reports_once_idx" ON "location_reports" USING btree ("location_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "locations_brand_idx" ON "locations" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_osm_idx" ON "locations" USING btree ("osm_id");--> statement-breakpoint
CREATE INDEX "offers_brand_idx" ON "offers" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "offers_state_idx" ON "offers" USING btree ("state");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");