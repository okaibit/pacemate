import { sql } from "drizzle-orm";
import {
  pgTable, text, timestamp, integer, serial, boolean, date, real, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

// One row per member. `id` is the Supabase Auth user id.
export const profiles = pgTable("profiles", {
  id: text().primaryKey(),
  name: text().notNull(),
  birthdate: date().notNull(),
  gender: text().notNull(),
  interestedIn: text("interested_in").array().notNull().default(sql`'{}'::text[]`),
  ageMin: integer("age_min").notNull().default(18),
  ageMax: integer("age_max").notNull().default(60),
  goal: text().notNull().default(""),
  sports: text().array().notNull().default(sql`'{}'::text[]`),
  level: text().notNull().default(""),
  routine: text().notNull().default(""),
  workStyle: text("work_style").notNull().default(""),
  countryCode: text("country_code"),
  country: text().notNull().default(""),
  homeCity: text("home_city").notNull(),
  currentCity: text("current_city").notNull(),
  // "Arriving soon": a planned trip. Both null when none is planned; past dates are ignored everywhere.
  nextCity: text("next_city"),
  nextArrival: date("next_arrival"),
  bio: text().notNull().default(""),
  photos: text().array().notNull().default(sql`'{}'::text[]`),
  paused: boolean().notNull().default(false),
  suspended: boolean().notNull().default(false),
  verified: boolean().notNull().default(false),
  weeklyGoal: integer("weekly_goal").notNull().default(4),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("profiles_current_city_idx").on(t.currentCity), index("profiles_next_city_idx").on(sql`lower(${t.nextCity})`)]);

export const swipes = pgTable("swipes", {
  swiperId: text("swiper_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  targetId: text("target_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  liked: boolean().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.swiperId, t.targetId] }), index("swipes_target_idx").on(t.targetId)]);

// userA < userB (sorted) so each pair has exactly one row.
export const matches = pgTable("matches", {
  id: serial().primaryKey(),
  userA: text("user_a").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  userB: text("user_b").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("matches_pair_idx").on(t.userA, t.userB), index("matches_user_b_idx").on(t.userB)]);

export const messages = pgTable("messages", {
  id: serial().primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  body: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_match_idx").on(t.matchId, t.id)]);

export const events = pgTable("events", {
  id: serial().primaryKey(),
  hostId: text("host_id").references(() => profiles.id, { onDelete: "cascade" }),
  city: text().notNull(),
  kind: text().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  location: text().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  timezone: text().notNull().default("UTC"),
  weekly: boolean().notNull().default(false),
  capacity: integer(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_city_idx").on(t.city)]);

export const rsvps = pgTable("rsvps", {
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const blocks = pgTable("blocks", {
  blockerId: text("blocker_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

// Reports are kept even if either account is later deleted.
export const reports = pgTable("reports", {
  id: serial().primaryKey(),
  reporterId: text("reporter_id").notNull(),
  reportedId: text("reported_id").notNull(),
  reason: text().notNull(),
  details: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily wellbeing check-in: one row per member per local day.
export const checkins = pgTable("checkins", {
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  day: date().notNull(),
  areas: text().array().notNull().default(sql`'{}'::text[]`),
  mood: integer(),
  sleepHours: real("sleep_hours"),
  note: text().notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

export const workouts = pgTable("workouts", {
  id: serial().primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  day: date().notNull(),
  sport: text().notNull(),
  minutes: integer().notNull(),
  distanceKm: real("distance_km"),
  note: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("workouts_user_day_idx").on(t.userId, t.day)]);

// Answers to the question of the day. The latest one shows on the member's profile.
export const dailyAnswers = pgTable("daily_answers", {
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  day: date().notNull(),
  question: text().notNull(),
  answer: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

// Monthly challenges a member has joined. `month` is YYYY-MM; challenge ids live in src/options.js.
export const challengeMembers = pgTable("challenge_members", {
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  month: text().notNull(),
  challengeId: text("challenge_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.month, t.challengeId] }), index("challenge_members_month_idx").on(t.month, t.challengeId)]);

// The last message each member has read in a match, for unread counts.
export const matchReads = pgTable("match_reads", {
  matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  lastReadId: integer("last_read_id").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.userId] })]);

// Kudos: a quick high-five on a match's logged workout.
export const kudos = pgTable("kudos", {
  workoutId: integer("workout_id").notNull().references(() => workouts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workoutId, t.userId] })]);
