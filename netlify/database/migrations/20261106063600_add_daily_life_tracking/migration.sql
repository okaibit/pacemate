CREATE TABLE "challenge_members" (
	"user_id" text,
	"month" text,
	"challenge_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_members_pkey" PRIMARY KEY("user_id","month","challenge_id")
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"user_id" text,
	"day" date,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"mood" integer,
	"sleep_hours" real,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_pkey" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "daily_answers" (
	"user_id" text,
	"day" date,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_answers_pkey" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "kudos" (
	"workout_id" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudos_pkey" PRIMARY KEY("workout_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "match_reads" (
	"match_id" integer,
	"user_id" text,
	"last_read_id" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_reads_pkey" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"sport" text NOT NULL,
	"minutes" integer NOT NULL,
	"distance_km" real,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "weekly_goal" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "challenge_members_month_idx" ON "challenge_members" ("month","challenge_id");--> statement-breakpoint
CREATE INDEX "workouts_user_day_idx" ON "workouts" ("user_id","day");--> statement-breakpoint
ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "daily_answers" ADD CONSTRAINT "daily_answers_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_workout_id_workouts_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "match_reads" ADD CONSTRAINT "match_reads_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "match_reads" ADD CONSTRAINT "match_reads_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;