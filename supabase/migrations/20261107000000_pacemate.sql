BEGIN;

CREATE TABLE "blocks" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_pkey" PRIMARY KEY("blocker_id","blocked_id")
);


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


CREATE TABLE "matches" (
	"id" serial PRIMARY KEY,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "messages" (
	"id" serial PRIMARY KEY,
	"match_id" integer NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


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


CREATE TABLE "reports" (
	"id" serial PRIMARY KEY,
	"reporter_id" text NOT NULL,
	"reported_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "rsvps" (
	"event_id" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvps_pkey" PRIMARY KEY("event_id","user_id")
);


CREATE TABLE "swipes" (
	"swiper_id" text,
	"target_id" text,
	"liked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_pkey" PRIMARY KEY("swiper_id","target_id")
);


CREATE INDEX "events_city_idx" ON "events" ("city");

CREATE UNIQUE INDEX "matches_pair_idx" ON "matches" ("user_a","user_b");

CREATE INDEX "matches_user_b_idx" ON "matches" ("user_b");

CREATE INDEX "messages_match_idx" ON "messages" ("match_id","id");

CREATE INDEX "profiles_current_city_idx" ON "profiles" ("current_city");

CREATE INDEX "swipes_target_idx" ON "swipes" ("target_id");

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_profiles_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_profiles_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_host_id_profiles_id_fkey" FOREIGN KEY ("host_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "matches" ADD CONSTRAINT "matches_user_a_profiles_id_fkey" FOREIGN KEY ("user_a") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "matches" ADD CONSTRAINT "matches_user_b_profiles_id_fkey" FOREIGN KEY ("user_b") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;

ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "swipes" ADD CONSTRAINT "swipes_swiper_id_profiles_id_fkey" FOREIGN KEY ("swiper_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "swipes" ADD CONSTRAINT "swipes_target_id_profiles_id_fkey" FOREIGN KEY ("target_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

-- Starter weekly community events hosted by Pacemate (host_id is NULL).
-- starts_at is the first occurrence; the API rolls weekly events forward to the next date.
INSERT INTO "events" ("host_id", "city", "kind", "title", "description", "location", "starts_at", "timezone", "weekly") VALUES
(NULL, 'Lisbon', 'Run', 'Sunrise run by the river', 'Easy 6 km along the Tagus, then coffee. All paces welcome, nobody gets dropped.', 'Belem waterfront, by the Padrao dos Descobrimentos', '2026-11-07 07:30:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Lisbon', 'Climb', 'Climb and coffee', 'Bouldering for every level. Shoes can be rented at the desk.', 'Indoor wall, Alcantara', '2026-11-11 18:30:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Lisbon', 'Surf', 'Cowork then surf', 'Laptops from 13:00 at the beach cafe, paddle out at 15:00.', 'Carcavelos beach', '2026-11-13 15:00:00 Europe/Lisbon', 'Europe/Lisbon', true),
(NULL, 'Bali', 'Run', 'Beach run and breakfast', '5 km on the sand at low tide, breakfast after.', 'Batu Bolong, Canggu', '2026-11-08 06:45:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Bali', 'Padel', 'Padel mixer', 'Rotating doubles, so you play with everyone. Rackets available.', 'Berawa padel club', '2026-11-10 17:00:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Bali', 'Yoga', 'Yoga and cowork', 'Vinyasa flow, then a quiet working morning together.', 'Ubud', '2026-11-12 09:00:00 Asia/Makassar', 'Asia/Makassar', true),
(NULL, 'Medellin', 'Ride', 'Hill ride', 'Steady climb with regroups at the top. Road or gravel bikes.', 'Alto de Las Palmas, start at Parque El Poblado', '2026-11-07 06:30:00 America/Bogota', 'America/Bogota', true),
(NULL, 'Medellin', 'Run', '5k social run', 'Conversational pace, drinks after for anyone who wants.', 'Parque Lleras', '2026-11-10 19:00:00 America/Bogota', 'America/Bogota', true),
(NULL, 'Barcelona', 'Run', 'Beach 5k social', 'Flat out-and-back along the promenade.', 'Barceloneta, by the W hotel', '2026-11-10 19:00:00 Europe/Madrid', 'Europe/Madrid', true),
(NULL, 'Berlin', 'Ride', 'Sunday gravel loop', '60 km through Grunewald at a chatty pace.', 'S-Bahn Grunewald', '2026-11-08 10:00:00 Europe/Berlin', 'Europe/Berlin', true),
(NULL, 'Mexico City', 'Padel', 'Padel night', 'Mixed levels, rotating partners.', 'Condesa', '2026-11-12 19:30:00 America/Mexico_City', 'America/Mexico_City', true);


CREATE TABLE "challenge_members" (
	"user_id" text,
	"month" text,
	"challenge_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_members_pkey" PRIMARY KEY("user_id","month","challenge_id")
);


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


CREATE TABLE "daily_answers" (
	"user_id" text,
	"day" date,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_answers_pkey" PRIMARY KEY("user_id","day")
);


CREATE TABLE "kudos" (
	"workout_id" integer,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kudos_pkey" PRIMARY KEY("workout_id","user_id")
);


CREATE TABLE "match_reads" (
	"match_id" integer,
	"user_id" text,
	"last_read_id" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "match_reads_pkey" PRIMARY KEY("match_id","user_id")
);


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


ALTER TABLE "profiles" ADD COLUMN "weekly_goal" integer DEFAULT 4 NOT NULL;

ALTER TABLE "profiles" ADD COLUMN "last_active_at" timestamp with time zone;

CREATE INDEX "challenge_members_month_idx" ON "challenge_members" ("month","challenge_id");

CREATE INDEX "workouts_user_day_idx" ON "workouts" ("user_id","day");

ALTER TABLE "challenge_members" ADD CONSTRAINT "challenge_members_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "daily_answers" ADD CONSTRAINT "daily_answers_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "kudos" ADD CONSTRAINT "kudos_workout_id_workouts_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE;

ALTER TABLE "kudos" ADD CONSTRAINT "kudos_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "match_reads" ADD CONSTRAINT "match_reads_match_id_matches_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE;

ALTER TABLE "match_reads" ADD CONSTRAINT "match_reads_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;

-- Use the accented spelling so these events match the city suggestions.
UPDATE "events" SET "city" = 'Medellín' WHERE "city" = 'Medellin' AND "host_id" IS NULL;


-- Weekly starter sessions hosted by Pacemate across every region. Weekly events roll forward automatically.
INSERT INTO "events" ("host_id", "city", "kind", "title", "description", "location", "starts_at", "timezone", "weekly") VALUES
-- Africa
(NULL, 'Lagos', 'Run', 'Saturday social run', 'Easy 5–8 km along the waterfront, small chops and drinks after.', 'Lekki-Ikoyi Link Bridge, Lekki side', '2026-11-07 06:30:00 Africa/Lagos', 'Africa/Lagos', true),
(NULL, 'Lagos', 'Bootcamp', 'Beach bootcamp', 'Bodyweight circuits on the sand. All levels, bring water.', 'Elegushi Beach', '2026-11-11 18:00:00 Africa/Lagos', 'Africa/Lagos', true),
(NULL, 'Abuja', 'Hike', 'Aso Rock sunrise hike', 'Steady climb with a view over the city. Trainers with grip recommended.', 'Jabi Lake Mall car park meet-up', '2026-11-08 06:00:00 Africa/Lagos', 'Africa/Lagos', true),
(NULL, 'Accra', 'Run', 'Sunday beach run', '6 km at a chatty pace, coconut water after.', 'Labadi Beach entrance', '2026-11-08 06:30:00 Africa/Accra', 'Africa/Accra', true),
(NULL, 'Accra', 'Football', 'Mixed five-a-side', 'Friendly mixed teams, rotating every 10 minutes.', 'East Legon astro pitch', '2026-11-12 18:30:00 Africa/Accra', 'Africa/Accra', true),
(NULL, 'Nairobi', 'Run', 'Karura forest run', '10 km on forest trails. Two pace groups, nobody gets dropped.', 'Karura Forest, Limuru Road gate', '2026-11-07 07:00:00 Africa/Nairobi', 'Africa/Nairobi', true),
(NULL, 'Nairobi', 'Hike', 'Ngong Hills hike', 'Full-day ridge walk. Carpool from the city at 6:30.', 'Ngong Hills, Kona Baridi gate', '2026-11-15 08:00:00 Africa/Nairobi', 'Africa/Nairobi', true),
(NULL, 'Kigali', 'Ride', 'Car-free day ride', 'Join the city car-free morning on two wheels, then breakfast.', 'Kigali Convention Centre roundabout', '2026-11-08 07:00:00 Africa/Kigali', 'Africa/Kigali', true),
(NULL, 'Kampala', 'Run', 'Hills and coffee run', '7 km over the hills, Ugandan coffee after.', 'Kololo Airstrip', '2026-11-07 06:30:00 Africa/Kampala', 'Africa/Kampala', true),
(NULL, 'Addis Ababa', 'Run', 'Entoto altitude run', 'Train where champions train. 8 km at altitude, easy pace.', 'Entoto Park main gate', '2026-11-08 06:30:00 Africa/Addis_Ababa', 'Africa/Addis_Ababa', true),
(NULL, 'Johannesburg', 'Run', 'Parkrun and brunch', 'Classic 5 km, then brunch in Parkhurst.', 'Delta Park', '2026-11-07 08:00:00 Africa/Johannesburg', 'Africa/Johannesburg', true),
(NULL, 'Cape Town', 'Hike', 'Lion''s Head sunset hike', 'Classic sunset climb. Bring a headlamp for the walk down.', 'Lion''s Head trailhead, Signal Hill Road', '2026-11-11 18:00:00 Africa/Johannesburg', 'Africa/Johannesburg', true),
(NULL, 'Cape Town', 'Surf', 'Muizenberg surf social', 'Beginner-friendly waves, boards rentable on the beach.', 'Surfer''s Corner, Muizenberg', '2026-11-08 09:00:00 Africa/Johannesburg', 'Africa/Johannesburg', true),
(NULL, 'Durban', 'Run', 'Promenade sunrise run', 'Flat 6 km along the Golden Mile.', 'uShaka Beach', '2026-11-07 06:00:00 Africa/Johannesburg', 'Africa/Johannesburg', true),
(NULL, 'Dar es Salaam', 'Run', 'Coco Beach run', 'Easy 5 km on the coast road, fresh juice after.', 'Coco Beach', '2026-11-07 06:30:00 Africa/Dar_es_Salaam', 'Africa/Dar_es_Salaam', true),
(NULL, 'Cairo', 'Ride', 'Desert sunrise ride', 'Road ride out towards the desert before the heat.', 'Cairo Festival City gate', '2026-11-13 06:00:00 Africa/Cairo', 'Africa/Cairo', true),
(NULL, 'Marrakech', 'Yoga', 'Rooftop yoga', 'Gentle flow above the medina, mint tea after.', 'Riad rooftop near Jemaa el-Fnaa (details in chat)', '2026-11-09 08:00:00 Africa/Casablanca', 'Africa/Casablanca', true),
(NULL, 'Casablanca', 'Run', 'Corniche run', '7 km along the ocean front.', 'Ain Diab, by the lighthouse', '2026-11-08 08:00:00 Africa/Casablanca', 'Africa/Casablanca', true),
(NULL, 'Dakar', 'Run', 'Corniche Ouest run', 'Ocean-side 6 km, all paces.', 'Place du Souvenir Africain', '2026-11-07 07:00:00 Africa/Dakar', 'Africa/Dakar', true),
-- Europe
(NULL, 'London', 'Run', 'Thames social run', '8 km past the bridges, pub after for anyone keen.', 'Southbank Centre steps', '2026-11-11 19:00:00 Europe/London', 'Europe/London', true),
(NULL, 'London', 'Climb', 'Bouldering social', 'Mixed levels, shoes available to rent.', 'Indoor wall, Hackney Wick', '2026-11-12 19:00:00 Europe/London', 'Europe/London', true),
(NULL, 'Manchester', 'Run', 'Canal run', 'Flat 7 km along the canals, coffee after.', 'Castlefield Bowl', '2026-11-08 09:00:00 Europe/London', 'Europe/London', true),
(NULL, 'Dublin', 'Run', 'Phoenix Park 5k', 'Easy loop through the park. Look out for the deer.', 'Phoenix Park, Papal Cross', '2026-11-08 10:00:00 Europe/Dublin', 'Europe/Dublin', true),
(NULL, 'Paris', 'Run', 'Seine evening run', '8 km along the river at conversation pace.', 'Pont Alexandre III, right bank', '2026-11-10 19:30:00 Europe/Paris', 'Europe/Paris', true),
(NULL, 'Amsterdam', 'Ride', 'Polder ride', '50 km out through the countryside, apple pie stop.', 'Amstel station', '2026-11-08 10:00:00 Europe/Amsterdam', 'Europe/Amsterdam', true),
(NULL, 'Madrid', 'Padel', 'Padel mixer', 'Rotating doubles so you play with everyone.', 'Club in Chamberí (details in chat)', '2026-11-12 20:00:00 Europe/Madrid', 'Europe/Madrid', true),
(NULL, 'Copenhagen', 'Swim', 'Harbour swim and sauna', 'Cold dip, then warm up in the sauna.', 'Islands Brygge harbour bath', '2026-11-08 09:00:00 Europe/Copenhagen', 'Europe/Copenhagen', true),
(NULL, 'Stockholm', 'Run', 'Djurgården loop', '9 km island loop, fika after.', 'Djurgårdsbron', '2026-11-08 10:00:00 Europe/Stockholm', 'Europe/Stockholm', true),
(NULL, 'Rome', 'Run', 'Ancient Rome run', 'Sunrise 6 km past the Colosseum before the crowds.', 'Circus Maximus', '2026-11-07 07:30:00 Europe/Rome', 'Europe/Rome', true),
(NULL, 'Milan', 'Run', 'Parco Sempione run', 'Easy 6 km loop, aperitivo after.', 'Arco della Pace', '2026-11-11 19:00:00 Europe/Rome', 'Europe/Rome', true),
(NULL, 'Athens', 'Hike', 'Lycabettus sunset', 'Short steep climb with the best sunset in town.', 'Lycabettus trail, Kolonaki', '2026-11-09 16:30:00 Europe/Athens', 'Europe/Athens', true),
(NULL, 'Istanbul', 'Run', 'Bosphorus run', '8 km along the water, simit and tea after.', 'Bebek park', '2026-11-08 08:00:00 Europe/Istanbul', 'Europe/Istanbul', true),
(NULL, 'Warsaw', 'Run', 'Vistula boulevards run', '6 km along the river.', 'Copernicus Science Centre', '2026-11-10 19:00:00 Europe/Warsaw', 'Europe/Warsaw', true),
(NULL, 'Prague', 'Run', 'Letná and river run', '7 km with a view over the bridges.', 'Letná Park metronome', '2026-11-08 09:30:00 Europe/Prague', 'Europe/Prague', true),
(NULL, 'Vienna', 'Run', 'Prater Hauptallee run', 'Flat and fast or slow and social. Your choice.', 'Praterstern', '2026-11-11 18:30:00 Europe/Vienna', 'Europe/Vienna', true),
(NULL, 'Porto', 'Surf', 'Matosinhos surf', 'Beginner-friendly beach break, coffee after.', 'Matosinhos beach', '2026-11-08 10:00:00 Europe/Lisbon', 'Europe/Lisbon', true),
-- Middle East
(NULL, 'Dubai', 'Run', 'Kite Beach sunrise run', '6 km along the beach before the heat.', 'Kite Beach, Umm Suqeim', '2026-11-07 06:00:00 Asia/Dubai', 'Asia/Dubai', true),
(NULL, 'Dubai', 'Padel', 'Padel night', 'Mixed levels, rotating partners.', 'JLT courts (details in chat)', '2026-11-10 20:00:00 Asia/Dubai', 'Asia/Dubai', true),
(NULL, 'Abu Dhabi', 'Ride', 'Yas Marina circuit ride', 'Ride the race track on the open evening.', 'Yas Marina Circuit', '2026-11-10 18:00:00 Asia/Dubai', 'Asia/Dubai', true),
(NULL, 'Doha', 'Run', 'Corniche run', 'Flat 7 km with skyline views.', 'Museum of Islamic Art park', '2026-11-07 06:00:00 Asia/Qatar', 'Asia/Qatar', true),
(NULL, 'Riyadh', 'Walk', 'Wadi Hanifa walk', 'Evening walk-and-talk along the valley.', 'Wadi Hanifa main path', '2026-11-12 19:00:00 Asia/Riyadh', 'Asia/Riyadh', true),
(NULL, 'Tel Aviv', 'Run', 'Tayelet beach run', '8 km along the promenade.', 'Gordon Beach', '2026-11-07 07:00:00 Asia/Jerusalem', 'Asia/Jerusalem', true),
-- Asia
(NULL, 'Singapore', 'Run', 'Marina Bay run', 'The classic 6 km bay loop at night.', 'Esplanade, outdoor theatre', '2026-11-11 19:30:00 Asia/Singapore', 'Asia/Singapore', true),
(NULL, 'Bangkok', 'Run', 'Lumpini Park run', 'Laps of the park before work.', 'Lumpini Park, King Rama VI statue', '2026-11-10 06:00:00 Asia/Bangkok', 'Asia/Bangkok', true),
(NULL, 'Chiang Mai', 'Hike', 'Doi Suthep trail', 'Monk''s trail up to Wat Pha Lat.', 'Trailhead at end of Suthep Road', '2026-11-08 07:00:00 Asia/Bangkok', 'Asia/Bangkok', true),
(NULL, 'Tokyo', 'Run', 'Imperial Palace loop', 'The famous 5 km loop, ramen after if you want.', 'Sakuradamon gate', '2026-11-08 08:00:00 Asia/Tokyo', 'Asia/Tokyo', true),
(NULL, 'Seoul', 'Run', 'Han River run', '7 km along the river, convenience-store ramyeon after.', 'Yeouido Hangang Park', '2026-11-11 20:00:00 Asia/Seoul', 'Asia/Seoul', true),
(NULL, 'Hong Kong', 'Hike', 'Dragon''s Back hike', 'Ridge walk ending at Big Wave Bay beach.', 'To Tei Wan bus stop', '2026-11-08 09:00:00 Asia/Hong_Kong', 'Asia/Hong_Kong', true),
(NULL, 'Mumbai', 'Run', 'Marine Drive run', 'Sunrise 6 km on the Queen''s Necklace.', 'Nariman Point', '2026-11-08 06:00:00 Asia/Kolkata', 'Asia/Kolkata', true),
(NULL, 'Bangalore', 'Run', 'Cubbon Park run', 'Shady 6 km loop and filter coffee.', 'Cubbon Park, bandstand', '2026-11-08 06:30:00 Asia/Kolkata', 'Asia/Kolkata', true),
(NULL, 'Delhi', 'Run', 'Lodhi Garden run', 'Easy laps among the tombs.', 'Lodhi Garden, gate 1', '2026-11-08 07:00:00 Asia/Kolkata', 'Asia/Kolkata', true),
(NULL, 'Kuala Lumpur', 'Run', 'KLCC Park run', '5 km under the towers.', 'KLCC Park fountain', '2026-11-10 19:00:00 Asia/Kuala_Lumpur', 'Asia/Kuala_Lumpur', true),
(NULL, 'Ho Chi Minh City', 'Run', 'Saigon river run', 'Sunrise 6 km, iced coffee after.', 'Bach Dang wharf', '2026-11-08 05:45:00 Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh', true),
(NULL, 'Manila', 'Run', 'BGC social run', 'Flat 5 km in the city centre.', 'Bonifacio High Street', '2026-11-11 19:00:00 Asia/Manila', 'Asia/Manila', true),
(NULL, 'Jakarta', 'Run', 'Car-free day run', 'Run the main avenue while it is closed to cars.', 'Bundaran HI', '2026-11-08 06:00:00 Asia/Jakarta', 'Asia/Jakarta', true),
-- North America
(NULL, 'New York', 'Run', 'Central Park loop', '6 miles at chatty pace, bagels after.', 'Engineers Gate, 90th and 5th', '2026-11-08 08:00:00 America/New_York', 'America/New_York', true),
(NULL, 'Los Angeles', 'Hike', 'Runyon Canyon hike', 'Quick loop with a city view, then coffee.', 'Runyon Canyon, Fuller Ave gate', '2026-11-08 08:00:00 America/Los_Angeles', 'America/Los_Angeles', true),
(NULL, 'San Francisco', 'Run', 'Crissy Field run', 'Flat 6 km with the Golden Gate view.', 'Crissy Field Center', '2026-11-08 09:00:00 America/Los_Angeles', 'America/Los_Angeles', true),
(NULL, 'Chicago', 'Run', 'Lakefront run', '8 km along Lake Michigan.', 'Buckingham Fountain', '2026-11-11 18:30:00 America/Chicago', 'America/Chicago', true),
(NULL, 'Austin', 'Run', 'Lady Bird Lake loop', 'The 5 km Butler trail loop, tacos after.', 'Lamar pedestrian bridge', '2026-11-11 18:30:00 America/Chicago', 'America/Chicago', true),
(NULL, 'Miami', 'Run', 'South Beach sunrise run', '6 km on the boardwalk.', 'Lummus Park, 10th St', '2026-11-08 07:00:00 America/New_York', 'America/New_York', true),
(NULL, 'Atlanta', 'Run', 'BeltLine run', 'Eastside trail out-and-back.', 'Ponce City Market', '2026-11-11 18:30:00 America/New_York', 'America/New_York', true),
(NULL, 'Toronto', 'Run', 'Waterfront run', '8 km along the lake.', 'Harbourfront Centre', '2026-11-11 18:30:00 America/Toronto', 'America/Toronto', true),
(NULL, 'Vancouver', 'Run', 'Seawall run', 'Stanley Park seawall loop.', 'Coal Harbour, Cardero St', '2026-11-08 09:00:00 America/Vancouver', 'America/Vancouver', true),
-- Latin America & Caribbean
(NULL, 'Buenos Aires', 'Run', 'Palermo lakes run', 'Flat 6 km in the parks, mate after.', 'Rosedal de Palermo', '2026-11-08 08:30:00 America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires', true),
(NULL, 'São Paulo', 'Run', 'Ibirapuera run', 'Laps of the park, açaí after.', 'Ibirapuera Park, gate 3', '2026-11-08 07:00:00 America/Sao_Paulo', 'America/Sao_Paulo', true),
(NULL, 'Rio de Janeiro', 'Volleyball', 'Beach volleyball', 'Mixed teams on the sand, all levels.', 'Ipanema, Posto 9', '2026-11-08 16:00:00 America/Sao_Paulo', 'America/Sao_Paulo', true),
(NULL, 'Bogotá', 'Ride', 'Ciclovía Sunday ride', 'Ride the car-free streets with the whole city.', 'Parque de la 93', '2026-11-08 08:00:00 America/Bogota', 'America/Bogota', true),
(NULL, 'Lima', 'Run', 'Malecón run', 'Clifftop 7 km over the Pacific.', 'Parque del Amor, Miraflores', '2026-11-08 07:00:00 America/Lima', 'America/Lima', true),
(NULL, 'Santiago', 'Hike', 'Cerro San Cristóbal', 'Climb to the city viewpoint.', 'Pío Nono entrance', '2026-11-08 08:30:00 America/Santiago', 'America/Santiago', true),
(NULL, 'Kingston', 'Run', 'Emancipation Park run', 'Laps and a cool-down chat.', 'Emancipation Park', '2026-11-07 06:00:00 America/Jamaica', 'America/Jamaica', true),
-- Oceania
(NULL, 'Sydney', 'Run', 'Bondi to Bronte run', 'Coastal path, ocean swim after for the brave.', 'Bondi Icebergs', '2026-11-07 06:30:00 Australia/Sydney', 'Australia/Sydney', true),
(NULL, 'Melbourne', 'Run', 'The Tan', 'Classic 3.8 km loop of the Botanic Gardens.', 'Tan Track, Anderson St', '2026-11-11 18:00:00 Australia/Melbourne', 'Australia/Melbourne', true),
(NULL, 'Brisbane', 'Run', 'River loop', 'Kangaroo Point to South Bank.', 'Story Bridge, Kangaroo Point', '2026-11-08 06:00:00 Australia/Brisbane', 'Australia/Brisbane', true),
(NULL, 'Perth', 'Run', 'Kings Park run', 'Hilly 6 km with the city view.', 'Kings Park, Fraser Ave', '2026-11-08 06:30:00 Australia/Perth', 'Australia/Perth', true),
(NULL, 'Auckland', 'Hike', 'Mount Eden sunrise', 'Short climb to the crater rim.', 'Mount Eden summit road', '2026-11-08 06:30:00 Pacific/Auckland', 'Pacific/Auckland', true);


ALTER TABLE "profiles" ADD COLUMN "next_city" text;

ALTER TABLE "profiles" ADD COLUMN "next_arrival" date;

CREATE INDEX "profiles_next_city_idx" ON "profiles" (lower("next_city"));

-- App tables are accessed only through the authenticated Edge Function.
-- In particular, never expose birthdates, preferences, reports or private check-ins
-- through the browser-facing Data API.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles','swipes','matches','messages','events','rsvps','blocks','reports','checkins','workouts','daily_answers','challenge_members','match_reads','kudos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;
REVOKE ALL ON SEQUENCE public.matches_id_seq, public.messages_id_seq, public.events_id_seq, public.reports_id_seq, public.workouts_id_seq FROM anon, authenticated;

-- Tie profile ownership to Supabase Auth without changing the legacy text IDs.
CREATE FUNCTION public.pacemate_check_profile_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text = NEW.id) THEN
    RAISE EXCEPTION 'Profile owner must exist in Supabase Auth';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_check_profile_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pacemate_profile_owner BEFORE INSERT OR UPDATE OF id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.pacemate_check_profile_owner();

CREATE FUNCTION public.pacemate_delete_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id::text;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.pacemate_delete_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pacemate_auth_delete BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.pacemate_delete_profile();

-- Uploads and deletions go through the API. Public photos preserve the existing
-- photo URL behaviour; private wellness data is never placed in Storage.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('photos', 'photos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

COMMIT;
