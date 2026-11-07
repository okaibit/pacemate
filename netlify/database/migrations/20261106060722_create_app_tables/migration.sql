CREATE TABLE "blocks" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"host_id" text,
	"city" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"weekly" boolean DEFAULT false NOT NULL,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"match_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"birthdate" date NOT NULL,
	"gender" text NOT NULL,
	"interested_in" text[] DEFAULT '{}'::text[] NOT NULL,
	"age_min" integer DEFAULT 18 NOT NULL,
	"age_max" integer DEFAULT 60 NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"sports" text[] DEFAULT '{}'::text[] NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"routine" text DEFAULT '' NOT NULL,
	"work_style" text DEFAULT '' NOT NULL,
	"home_city" text NOT NULL,
	"current_city" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"photos" text[] DEFAULT '{}'::text[] NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY,
	"reporter_id" text NOT NULL,
	"reported_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"event_id" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvps_pkey" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"swiper_id" text,
	"target_id" text,
	"liked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_pkey" PRIMARY KEY("swiper_id","target_id")
);
--> statement-breakpoint
CREATE INDEX "events_city_idx" ON "events" ("city");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_pair_idx" ON "matches" ("user_a","user_b");--> statement-breakpoint
CREATE INDEX "matches_user_b_idx" ON "matches" ("user_b");--> statement-breakpoint
CREATE INDEX "messages_match_idx" ON "messages" ("match_id","id");--> statement-breakpoint
CREATE INDEX "profiles_current_city_idx" ON "profiles" ("current_city");--> statement-breakpoint
CREATE INDEX "swipes_target_idx" ON "swipes" ("target_id");--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_profiles_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_profiles_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_host_id_profiles_id_fkey" FOREIGN KEY ("host_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_a_profiles_id_fkey" FOREIGN KEY ("user_a") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_b_profiles_id_fkey" FOREIGN KEY ("user_b") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_swiper_id_profiles_id_fkey" FOREIGN KEY ("swiper_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_target_id_profiles_id_fkey" FOREIGN KEY ("target_id") REFERENCES "profiles"("id") ON DELETE CASCADE;