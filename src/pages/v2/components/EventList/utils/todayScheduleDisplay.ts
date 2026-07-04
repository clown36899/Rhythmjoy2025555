import type { SocialSchedule } from "../../../../social/types";

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const getTodayScheduleWeekdayLabel = (date: Date = new Date()): string => (
  `(${KOREAN_WEEKDAYS[date.getDay()]})`
);

export const getTodaySchedulePlaceLabel = (schedule: SocialSchedule) => (
  schedule.location || schedule.place_name || schedule.address || ""
);

export const isTodaySocialSchedule = (schedule: SocialSchedule): boolean => {
  const category = String(schedule.category || "").toLowerCase();
  const genre = String(schedule.genre || schedule.v2_genre || "").toLowerCase();
  return category === "social" || genre.includes("소셜") || genre.includes("social");
};

export const getTodaySchedulePrimaryText = (schedule: SocialSchedule): string => {
  const place = getTodaySchedulePlaceLabel(schedule);
  if (!isTodaySocialSchedule(schedule) || !place) return schedule.title;
  return `${place} : ${schedule.title}`;
};

export const shouldShowTodaySchedulePlaceLine = (schedule: SocialSchedule): boolean => (
  !isTodaySocialSchedule(schedule) && Boolean(getTodaySchedulePlaceLabel(schedule))
);
