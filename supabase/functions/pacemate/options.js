// Shared option lists used by both the app and the API (server/options.ts re-exports this file).
export const GENDERS = ["Woman", "Man", "Non-binary"];
export const GOALS = ["A relationship", "Something casual", "A training partner", "Friends in a new city", "Open to all"];
export const LEVELS = ["Just starting", "Regular", "Competitive"];
export const ROUTINES = ["Early riser", "Lunchtime", "After work", "Weekend warrior", "Whenever"];
export const WORK = ["Remote full-time", "Freelance", "Digital nomad", "Hybrid", "Office", "Shift work", "Student", "Self-employed"];
export const SPORTS = ["Running", "Trail running", "Walking", "Hiking", "Cycling", "Mountain biking", "Climbing", "Surfing",
  "Kitesurfing", "Swimming", "Yoga", "Pilates", "Gym", "Calisthenics", "CrossFit", "HIIT", "Boxing", "Muay Thai", "Martial arts",
  "Padel", "Tennis", "Squash", "Badminton", "Table tennis", "Golf", "Football", "Basketball", "Volleyball", "Netball",
  "Rugby", "Cricket", "Handball", "Skiing", "Snowboarding", "Skateboarding", "Triathlon", "Rowing", "Dance"];
export const EVENT_KINDS = ["Run", "Walk", "Ride", "Hike", "Climb", "Surf", "Swim", "Yoga", "Gym", "Bootcamp", "Padel",
  "Tennis", "Football", "Basketball", "Volleyball", "Dance", "Wellness", "Social", "Other"];
export const REPORT_REASONS = ["Fake profile", "Inappropriate photos", "Harassment", "Spam or scam", "Underage", "Other"];

// Suggested cities by region. Members can still type any city; these power autocomplete and the region filters.
export const REGIONS = {
  "Africa": ["Lagos", "Abuja", "Port Harcourt", "Accra", "Kumasi", "Dakar", "Abidjan", "Lomé", "Cotonou", "Freetown", "Monrovia",
    "Douala", "Yaoundé", "Kinshasa", "Luanda", "Nairobi", "Mombasa", "Kampala", "Kigali", "Dar es Salaam", "Zanzibar", "Addis Ababa",
    "Lusaka", "Harare", "Gaborone", "Windhoek", "Maputo", "Johannesburg", "Pretoria", "Cape Town", "Durban", "Port Louis",
    "Antananarivo", "Cairo", "Alexandria", "Casablanca", "Marrakech", "Rabat", "Tangier", "Tunis", "Algiers"],
  "Europe": ["London", "Manchester", "Edinburgh", "Dublin", "Lisbon", "Porto", "Madrid", "Barcelona", "Valencia", "Seville",
    "Málaga", "Paris", "Lyon", "Nice", "Amsterdam", "Rotterdam", "Brussels", "Berlin", "Munich", "Hamburg", "Zurich", "Geneva",
    "Vienna", "Prague", "Budapest", "Warsaw", "Krakow", "Copenhagen", "Stockholm", "Oslo", "Helsinki", "Tallinn", "Riga",
    "Vilnius", "Rome", "Milan", "Florence", "Athens", "Split", "Belgrade", "Bucharest", "Sofia", "Istanbul", "Tbilisi", "Kyiv",
    "Reykjavik"],
  "Middle East": ["Dubai", "Abu Dhabi", "Doha", "Riyadh", "Jeddah", "Muscat", "Manama", "Kuwait City", "Amman", "Beirut", "Tel Aviv"],
  "Asia": ["Bali", "Jakarta", "Singapore", "Kuala Lumpur", "Penang", "Bangkok", "Chiang Mai", "Phuket", "Ho Chi Minh City",
    "Hanoi", "Da Nang", "Manila", "Cebu", "Siargao", "Hong Kong", "Taipei", "Seoul", "Busan", "Tokyo", "Osaka", "Kyoto",
    "Shanghai", "Beijing", "Shenzhen", "Mumbai", "Delhi", "Bangalore", "Goa", "Chennai", "Hyderabad", "Colombo", "Kathmandu",
    "Dhaka", "Karachi", "Lahore", "Almaty", "Tashkent"],
  "North America": ["New York", "Los Angeles", "San Francisco", "San Diego", "Seattle", "Portland", "Denver", "Austin", "Houston",
    "Dallas", "Chicago", "Atlanta", "Miami", "Boston", "Washington DC", "Nashville", "Toronto", "Vancouver", "Montreal",
    "Calgary", "Mexico City", "Guadalajara", "Oaxaca", "Playa del Carmen", "Tulum"],
  "Latin America & Caribbean": ["Medellín", "Bogotá", "Cartagena", "Lima", "Cusco", "Quito", "Santiago", "Buenos Aires",
    "Córdoba", "Montevideo", "São Paulo", "Rio de Janeiro", "Florianópolis", "Salvador", "San José", "Santa Teresa",
    "Panama City", "Havana", "San Juan", "Kingston", "Santo Domingo", "Port of Spain", "Bridgetown"],
  "Oceania": ["Sydney", "Melbourne", "Brisbane", "Gold Coast", "Perth", "Adelaide", "Auckland", "Wellington", "Queenstown", "Fiji"],
};
export const CITIES = Object.values(REGIONS).flat();

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const REGION_OF = new Map(Object.entries(REGIONS).flatMap(([r, list]) => list.map((c) => [norm(c), r])));
/** Region for a city name (accent and case insensitive), or "Other" for cities not in the list. */
export const regionOf = (city) => REGION_OF.get(norm(city)) || "Other";
const CITY_OF = new Map(CITIES.map((c) => [norm(c), c]));
/** The city list's spelling for a typed city ("medellin" -> "Medellín"), or the trimmed input if it is not in the list. */
export const canonCity = (city) => CITY_OF.get(norm(city)) || String(city || "").trim();
/** True when two city names are the same place, ignoring case and accents. */
export const sameCity = (a, b) => !!a && !!b && norm(a) === norm(b);

// "Arriving soon" trips. Dates are YYYY-MM-DD strings compared in UTC, so they never shift around midnight.
export const utcToday = () => new Date().toISOString().slice(0, 10);
/** The latest allowed arrival date: 12 months from today (UTC). */
export const tripMaxDate = () => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10); };
/** The trip a member has planned, or null when there is none or its date has passed. */
export const activeTrip = (p) => (p?.nextCity && p?.nextArrival && p.nextArrival >= utcToday() ? { city: p.nextCity, date: p.nextArrival } : null);
/** "12 Nov", with the year added when it is not this year. */
export const tripDate = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  const opts = { day: "numeric", month: "short", timeZone: "UTC" };
  if (d.getUTCFullYear() !== new Date().getUTCFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-GB", opts);
};

// Daily check-in: the areas of life a member can tick off each day.
export const LIFE_AREAS = [
  { k: "Move", icon: "🏃", label: "Moved my body" },
  { k: "Fuel", icon: "🥗", label: "Ate well" },
  { k: "Hydrate", icon: "💧", label: "Drank enough water" },
  { k: "Sleep", icon: "😴", label: "Slept 7h or more" },
  { k: "Mind", icon: "🧘", label: "Rested my mind" },
  { k: "Outdoors", icon: "🌳", label: "Got outside" },
  { k: "Connect", icon: "🤝", label: "Spent time with people" },
  { k: "Grow", icon: "📚", label: "Worked on a goal" },
];
export const AREA_KEYS = LIFE_AREAS.map((a) => a.k);
export const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

// One question per day for everyone. Answers show on your profile so matches have something to talk about.
export const DAILY_QUESTIONS = [
  "What got you moving today?",
  "Your perfect Sunday morning, in one sentence?",
  "Best post-workout meal you know?",
  "A goal you are quietly working towards?",
  "Where is your favourite place to train outdoors?",
  "What helps you switch off after a long day?",
  "The song that always makes you go faster?",
  "Sunrise session or sunset session?",
  "A city you would love to run or ride through?",
  "What is a small habit that changed your life?",
  "Your go-to healthy snack?",
  "What would your ideal active first date look like?",
  "Who in your life keeps you accountable?",
  "A book, podcast or show that taught you something lately?",
  "Hardest workout you have ever finished?",
  "How do you recover on rest days?",
  "What is one thing you are proud of this week?",
  "Something new you want to try this year?",
  "Coffee, tea or smoothie before training?",
  "What does a balanced week look like for you?",
  "A dish from home you could eat every day?",
  "Team sport or solo grind?",
  "What do you do to look after your mental health?",
  "The best trip you have taken that involved sport?",
  "How do you like to celebrate a win?",
  "What are you learning right now outside of sport?",
  "If you had a free afternoon today, how would you spend it?",
  "What is your non-negotiable for a good day?",
  "Describe your dream training holiday.",
  "What did you do today that your future self will thank you for?",
];
export function questionFor(day) {
  const n = Math.floor(Date.parse(day + "T00:00:00Z") / 86400000);
  return DAILY_QUESTIONS[((n % DAILY_QUESTIONS.length) + DAILY_QUESTIONS.length) % DAILY_QUESTIONS.length];
}

// Monthly challenges. They restart on the 1st of every month, so there is always something new to join.
// `metric` decides how progress is counted from check-ins and logged workouts.
export const CHALLENGES = [
  { id: "active-days", title: "20 active days", desc: "Log a workout or tick Move on 20 days this month.", metric: "activeDays", target: 20, icon: "🔥" },
  { id: "minutes", title: "600 active minutes", desc: "Add up 10 hours of training this month, any sport counts.", metric: "minutes", target: 600, icon: "⏱️" },
  { id: "distance", title: "100 km club", desc: "Run, walk, ride or swim 100 km in total this month.", metric: "distance", target: 100, icon: "📍" },
  { id: "sleep", title: "Sleep well", desc: "Sleep 7 hours or more on 20 nights this month.", metric: "area:Sleep", target: 20, icon: "😴" },
  { id: "mind", title: "Calm mind", desc: "Meditate, journal or rest your mind on 15 days.", metric: "area:Mind", target: 15, icon: "🧘" },
  { id: "fuel", title: "Fuel right", desc: "Eat well and hydrate on 20 days this month.", metric: "area:Fuel", target: 20, icon: "🥗" },
  { id: "connect", title: "Show up for people", desc: "Spend real time with friends, family or new people on 10 days.", metric: "area:Connect", target: 10, icon: "🤝" },
  { id: "balance", title: "Full balance", desc: "Tick 5 or more areas of life on 12 days this month.", metric: "balanced", target: 12, icon: "⚖️" },
];
