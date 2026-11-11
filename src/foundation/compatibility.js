// Public profile data only. Missing information earns no points; scores are never stored.
export const COMPATIBILITY_WEIGHTS = Object.freeze({
  sports: 25,
  availability: 20,
  intensity: 15,
  location: 15,
  experience: 10,
  lifestyle: 10,
  intentions: 5,
});
export const MODES = Object.freeze({
  dating: "Date",
  training_partner: "Play",
  friendship: "Friend",
});
export const INTENTION_MODE = Object.freeze({
  play: "training_partner",
  friend: "friendship",
  date: "dating",
});
// Prefer Date when it is enabled; never enable an intention on a member's behalf.
export function preferredDiscoveryIntention(enabledIntentions = []) {
  return enabledIntentions.includes("date") ? "date" : enabledIntentions[0] || "play";
}
export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const TIMES = ["Morning", "Afternoon", "Evening"];
export const INTENSITIES = ["low", "moderate", "high"];
export const EXPERIENCE = ["beginner", "intermediate", "advanced"];
const list = (value) =>
  Array.isArray(value)
    ? [
      ...new Set(
        value.filter((v) => typeof v === "string" && v.trim()).map((v) =>
          v.trim().toLowerCase()
        ),
      ),
    ]
    : [];
const intersection = (a, b) => list(a).filter((v) => list(b).includes(v));
const overlap = (a, b) => {
  const union = new Set([...list(a), ...list(b)]);
  return union.size ? intersection(a, b).length / union.size : 0;
};
const same = (a, b) =>
  typeof a === "string" && a.trim() &&
  a.trim().toLowerCase() === String(b || "").trim().toLowerCase();
const distance = (a, b, choices) =>
  choices.includes(a) && choices.includes(b)
    ? 1 -
      Math.abs(choices.indexOf(a) - choices.indexOf(b)) / (choices.length - 1)
    : 0;
export function computeCompatibility(viewer, candidate, intention = null) {
  const sharedModes = intersection(
    viewer?.connection_modes,
    candidate?.connection_modes,
  ).filter((mode) =>
    Object.hasOwn(MODES, mode) &&
    (mode !== "dating" || (viewer.age >= 18 && candidate.age >= 18))
  );
  const selectedMode = intention && Object.hasOwn(INTENTION_MODE, intention)
    ? INTENTION_MODE[intention]
    : null;
  const modes = selectedMode
    ? sharedModes.filter((mode) => mode === selectedMode)
    : sharedModes;
  if (!viewer || !candidate || viewer.id === candidate.id || !modes.length) {
    return { eligible: false, score: 0, reasons: [], breakdown: {} };
  }
  const a = Array.isArray(viewer.user_sports) ? viewer.user_sports : [],
    b = Array.isArray(candidate.user_sports) ? candidate.user_sports : [];
  const shared = a.filter((s) => b.some((t) => t.sport_id === s.sport_id));
  const reasons = shared.map((s) =>
    `Both enjoy ${String(s.name || s.sport_id).toLowerCase()}`
  );
  const days = intersection(viewer.preferred_days, candidate.preferred_days),
    times = intersection(viewer.preferred_times, candidate.preferred_times);
  const availability =
    overlap(viewer.preferred_days, candidate.preferred_days) *
    overlap(viewer.preferred_times, candidate.preferred_times);
  if (days.length && times.length) {
    reasons.push(`Both available ${days.join(", ")} ${times.join(" / ")}`);
  }
  const intensity = distance(
    viewer.preferred_intensity,
    candidate.preferred_intensity,
    INTENSITIES,
  );
  if (intensity === 1) {
    reasons.push(`Both prefer ${viewer.preferred_intensity} intensity`);
  }
  const location =
    same(viewer.city, candidate.city) && same(viewer.country, candidate.country)
      ? 1
      : same(viewer.country, candidate.country)
      ? 0.35
      : 0;
  if (location === 1) reasons.push(`Both in ${viewer.city}`);
  const experience = shared.length
    ? shared.reduce(
      (sum, s) =>
        sum + distance(
          s.experience_level,
          b.find((t) => t.sport_id === s.sport_id).experience_level,
          EXPERIENCE,
        ),
      0,
    ) / shared.length
    : 0;
  if (experience === 1) {
    reasons.push("Similar experience in your shared sports");
  }
  const lifestyle = overlap(
    viewer.lifestyle_interests,
    candidate.lifestyle_interests,
  );
  for (
    const interest of intersection(
      viewer.lifestyle_interests,
      candidate.lifestyle_interests,
    )
  ) reasons.push(`Both enjoy ${interest}`);
  reasons.push(
    `Both open to ${modes.map((mode) =>
      mode === "dating" ? "Date" : mode === "training_partner" ? "Play" : "Friend"
    ).join(" and ")}`,
  );
  const factors = {
    sports: overlap(a.map((s) => s.sport_id), b.map((s) => s.sport_id)),
    availability,
    intensity,
    location,
    experience,
    lifestyle,
    intentions: selectedMode ? 1 : overlap(
      viewer.connection_modes.filter((m) =>
        Object.hasOwn(MODES, m) && (m !== "dating" || viewer.age >= 18)
      ),
      candidate.connection_modes.filter((m) =>
        Object.hasOwn(MODES, m) && (m !== "dating" || candidate.age >= 18)
      ),
    ),
  };
  const breakdown = Object.fromEntries(
    Object.entries(COMPATIBILITY_WEIGHTS).map((
      [key, weight],
    ) => [key, Math.round(factors[key] * weight * 100) / 100]),
  );
  return {
    eligible: true,
    score: Math.round(Object.values(breakdown).reduce((sum, n) => sum + n, 0)),
    reasons,
    breakdown,
  };
}
export function profileCompleteness(p) {
  const fields = {
    name: !!p?.name?.trim(),
    birthdate: !!p?.birthdate,
    location: !!p?.city?.trim() && !!p?.country?.trim(),
    bio: !!p?.bio?.trim(),
    languages: !!p?.languages?.length,
    photos: !!p?.photos?.length,
    availability: !!p?.preferred_days?.length && !!p?.preferred_times?.length,
    intensity: INTENSITIES.includes(p?.preferred_intensity),
    lifestyle: !!p?.lifestyle_interests?.length,
    modes: !!p?.connection_modes?.length,
    sports: !!p?.user_sports?.length &&
      p.user_sports.every((s) =>
        EXPERIENCE.includes(s.experience_level) &&
        INTENSITIES.includes(s.preferred_intensity)
      ),
  };
  return {
    percent: Math.round(
      Object.values(fields).filter(Boolean).length /
        Object.keys(fields).length * 100,
    ),
    missing: Object.keys(fields).filter((k) => !fields[k]),
  };
}
