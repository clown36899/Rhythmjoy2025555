export type CalendarEventKindInput = {
  id?: string | number | null;
  category?: string | null;
  activity_type?: string | null;
  genre?: string | null;
  group_id?: string | number | null;
};

export const normalizeCalendarEventKindPart = (value?: string | null) => (
  value?.trim().replace(/\s+/g, " ").toLowerCase() || ""
);

export const isCalendarClassLikeCategory = (category?: string | null) => {
  const normalized = normalizeCalendarEventKindPart(category);
  return (
    normalized === "class" ||
    normalized === "regular" ||
    normalized === "club" ||
    normalized === "club_lesson" ||
    normalized === "club_regular"
  );
};

export const isCalendarSocialLikeEvent = (event: CalendarEventKindInput) => {
  const category = normalizeCalendarEventKindPart(event.category);
  const activityType = normalizeCalendarEventKindPart(event.activity_type);
  const genre = normalizeCalendarEventKindPart(event.genre);

  if (isCalendarClassLikeCategory(category)) return false;
  if (category === "social") return true;
  if (activityType === "class") return false;
  if (activityType === "social") return true;

  return (
    genre.includes("소셜") ||
    genre.includes("졸공") ||
    genre.includes("social") ||
    Boolean(event.group_id) ||
    String(event.id || "").startsWith("social-")
  );
};
