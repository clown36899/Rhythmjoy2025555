import type { Event as BaseEvent } from "../../../lib/supabase";
import { parseVideoUrl, isValidVideoUrl } from "../../../utils/videoEmbed";

export { parseVideoUrl, isValidVideoUrl };

export interface Event extends Omit<BaseEvent, 'description' | 'video_url' | 'organizer_phone' | 'capacity' | 'registered' | 'link1' | 'link2' | 'link3' | 'link_name1' | 'link_name2' | 'link_name3' | 'password' | 'show_title_on_billboard' | 'storage_path' | 'scope'> {
    description?: string | null;
    video_url?: string | null;
    organizer_phone?: string | null;
    capacity?: number | null;
    registered?: number | null;
    link1?: string | null;
    link2?: string | null;
    link3?: string | null;
    author_nickname?: string | null;
    link_name1?: string | null;
    link_name2?: string | null;
    link_name3?: string | null;
    password?: string | null;
    show_title_on_billboard?: boolean | null;
    storage_path?: string | null;
    genre?: string | null;
    event_dates?: string[];
    is_class?: boolean | null;
    scope?: 'domestic' | 'overseas' | null;
    is_social_integrated?: boolean;
    day_of_week?: number | null;
    board_users?: any[];
}

export interface GenreWeightSettings {
    [genre: string]: number;
}

export const CLUB_LESSON_GENRE = '동호회강습';

// Default Weights (Fallback)
export const DEFAULT_GENRE_WEIGHTS: GenreWeightSettings = {
    "린디합": 1.0,
    "지터벅": 1.0,
    "솔로재즈": 1.0,
    "정규강습": 1.0,
    "발보아": 1.0,
    "블루스": 1.0,
    "탭댄스": 1.0,
    "웨스트코스트스윙": 1.0,
    "부기우기": 1.0,
    "샤그": 1.0,
    "기타": 1.0
};

// 한국 시간(KST) 기준 날짜 문자열 반환 (YYYY-MM-DD) - 절대적인 수동 방식
export const getLocalDateString = (date: Date = new Date()) => {
    // 1. UTC 시간에 9시간을 더해 한국 날짜 객체를 만듦
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const y = kstDate.getUTCFullYear();
    const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kstDate.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// DatePicker용 날짜 포맷 (YYYY-MM-DD)
export const formatDateForInput = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

// 한국 시간(KST) 기준 요일 숫자 반환 (0:일 ~ 6:토)
export const getKSTDay = (date: Date = new Date()) => {
    // 1. UTC 시간에 9시간을 더해 한국 날짜 객체를 만듦
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.getUTCDay();
};

// 요일 이름을 가져오는 헬퍼 (예: '일', '월')
export const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    // 날짜 문자열(YYYY-MM-DD)을 기반으로 해당 일의 요일 인덱스 추출
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return days[d.getDay()];
};

// Seeded Random 함수
export const seededRandom = (seed: number) => {
    let value = seed;
    return () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
    };
};

/**
 * 이벤트 정렬 함수
 */
export const sortEvents = (
    eventsToSort: Event[],
    sortType: string,
    isYearView: boolean = false,
    genreWeights: GenreWeightSettings | null = null, // Optional weights
    applyGenreWeights: boolean = false,
    seed?: number // Optional seed for stable randomization
) => {
    const eventsCopy = [...eventsToSort];
    const today = getLocalDateString();

    // 년 단위 + 시간순일 때는 진행 중/종료 구분 없이 날짜 순서대로만 정렬
    if (isYearView && sortType === "time") {
        return eventsCopy.sort((a, b) => {
            const dateStrA = a.start_date || a.date;
            const dateStrB = b.start_date || b.date;
            if (!dateStrA && !dateStrB) return 0;
            if (!dateStrA) return 1;
            if (!dateStrB) return -1;
            const dateA = new Date(`${dateStrA} ${a.time}`);
            const dateB = new Date(`${dateStrB} ${b.time}`);
            return dateA.getTime() - dateB.getTime();
        });
    }

    // 달 단위 또는 랜덤/제목순일 때는 진행 중/종료 이벤트 분류 (종료일 기준)
    const ongoingEvents: Event[] = [];
    const endedEvents: Event[] = [];

    eventsCopy.forEach((event) => {
        const endDate = event.end_date || event.date;
        if (endDate && endDate < today) {
            endedEvents.push(event);
        } else {
            ongoingEvents.push(event);
        }
    });

    // 각 그룹 내에서 정렬 적용
    const sortGroup = (group: Event[]) => {
        switch (sortType) {
            case "random": {
                // 0. Separate "New" events (72 hours)
                const now = new Date();
                const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72시간

                const newEvents: Event[] = [];
                const regularEvents: Event[] = [];

                group.forEach(event => {
                    if (event.created_at && new Date(event.created_at) > seventyTwoHoursAgo) {
                        newEvents.push(event);
                    } else {
                        regularEvents.push(event);
                    }
                });

                // Sort "New" events by created_at descending (Newest first)
                newEvents.sort((a, b) => {
                    const tA = new Date(a.created_at!).getTime();
                    const tB = new Date(b.created_at!).getTime();
                    return tB - tA;
                });

                // Randomize regular events
                // 랜덤 정렬 - 시드가 있으면 사용하고, 없으면 새로고침할 때마다 변하도록 생성
                const finalSeed = seed ?? (Date.now() + Math.floor(Math.random() * 1000000));
                const random = seededRandom(finalSeed);

                let sortedRegular: Event[] = [];

                if (applyGenreWeights && genreWeights) {
                    // Weighted Shuffle (Efraimidis-Spirakis)
                    // k_i = u_i ^ (1 / w_i)
                    // Sort by k_i descending
                    sortedRegular = [...regularEvents].map(event => {
                        // Extract first/main genre for weighting
                        const eventGenre = event.genre ? event.genre.split(',')[0].trim() : '기타';
                        const weight = genreWeights[eventGenre] || 1.0;
                        const u = random(); // Uniform(0,1)
                        // Avoid division by zero or negative weights
                        const safeWeight = weight > 0 ? weight : 0.0001;
                        const score = Math.pow(u, 1 / safeWeight);

                        return { event, score };
                    })
                        .sort((a, b) => b.score - a.score)
                        .map(item => item.event);

                } else {
                    // Standard Fisher-Yates Shuffle (Uniform)
                    const shuffled = [...regularEvents];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    sortedRegular = shuffled;
                }

                // Combine: New Events First
                return [...newEvents, ...sortedRegular];
            }
            case "time":
                // 시간순 정렬 (날짜 + 시간) - 달 단위에서만 사용
                return group.sort((a, b) => {
                    const dateStrA = a.start_date || a.date;
                    const dateStrB = b.start_date || b.date;
                    if (!dateStrA && !dateStrB) return 0;
                    if (!dateStrA) return 1;
                    if (!dateStrB) return -1;
                    const dateA = new Date(`${dateStrA} ${a.time}`);
                    const dateB = new Date(`${dateStrB} ${b.time}`);
                    return dateA.getTime() - dateB.getTime();
                });
            case "title":
                // 제목순 정렬 (가나다순)
                return group.sort((a, b) => a.title.localeCompare(b.title, "ko"));
            default:
                return group;
        }
    };

    // 진행 중 이벤트를 위로, 종료된 이벤트를 아래로
    return [...sortGroup(ongoingEvents), ...sortGroup(endedEvents)];
};

/**
 * 날짜 파싱 헬퍼 (YYYY-MM-DD 형식일 때만 T12:00:00 추가)
 */
export const parseDateSafe = (dateStr: string) => {
    if (dateStr.length === 10) {
        return new Date(`${dateStr}T12:00:00`);
    }
    return new Date(dateStr);
};

export interface FilterContext {
    selectedCategory?: string;
    selectedGenre?: string | null; // 행사용
    selectedClassGenre?: string | null; // 강습용
    selectedClubGenre?: string | null; // 동호회용
    searchTerm?: string;
    selectedDate?: Date | null;
    targetMonth?: Date; // For month filtering
    viewMode?: "month" | "year";
    selectedWeekday?: number | null;
}

/**
 * 이벤트 필터링 로직
 */
export const isEventMatchingFilter = (event: Event, context: FilterContext): boolean => {
    const {
        selectedCategory,
        selectedGenre,
        selectedClassGenre,
        selectedClubGenre,
        searchTerm,
        selectedDate,
        targetMonth,
        viewMode = "month",
        selectedWeekday
    } = context;

    // 카테고리 필터
    if (selectedCategory && selectedCategory !== "all" && selectedCategory !== "none") {
        if (event.category !== selectedCategory) return false;
    }
    if (selectedCategory === "none") return false;

    // 장르 필터 (카테고리별 분리)
    if (event.category === 'class' && selectedClassGenre) {
        if (!event.genre) return false;
        const eventGenres = event.genre.split(',').map(s => s.trim().toLowerCase());
        const searchGenre = selectedClassGenre.trim().toLowerCase();
        if (!eventGenres.includes(searchGenre)) return false;
    } else if (event.category === 'club' && selectedClubGenre) {
        if (!event.genre) return false;
        const eventGenres = event.genre.split(',').map(s => s.trim().toLowerCase());
        const searchGenre = selectedClubGenre.trim().toLowerCase();
        if (!eventGenres.includes(searchGenre)) return false;
    } else if (event.category === 'event' && selectedGenre) {
        if (!event.genre) return false;
        const eventGenres = event.genre.split(',').map(s => s.trim().toLowerCase());
        const searchGenre = selectedGenre.trim().toLowerCase();
        if (!eventGenres.includes(searchGenre)) return false;
    }

    // 검색어 필터
    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
            (event.title && event.title.toLowerCase().includes(term)) ||
            (event.location && event.location.toLowerCase().includes(term)) ||
            (event.organizer && event.organizer.toLowerCase().includes(term)) ||
            (event.genre && event.genre.toLowerCase().includes(term));

        if (!matchesSearch) return false;

        // 검색어가 있을 때는 3년치 데이터만 필터링 (월 필터 무시 logic was in component, need to support it here)
        // In component: if (searchTerm.trim()) { ... check year range ... return matchesCategory && matchesGenre && matchesSearch && matchesYearRange; }
        // So if searchTerm is present, we skip targetMonth check, but we still check Year Range.

        // Let's implement year range check for search
        const currentYear = new Date().getFullYear();
        const eventDate = event.start_date || event.date;
        if (!eventDate) return false;
        const eventYear = new Date(eventDate).getFullYear();
        const matchesYearRange = eventYear >= currentYear - 1 && eventYear <= currentYear + 1;

        if (!matchesYearRange) return false;

        // If search term is present, we return here (skipping date/month checks as per original logic)
        return true;
    }

    // 특정 날짜가 선택된 경우
    if (selectedDate) {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        // event_dates 배열이 있으면 그 중에서 찾기
        if (event.event_dates && event.event_dates.length > 0) {
            if (event.event_dates.includes(selectedDateString)) return true; // Category/Genre checked above
            return false;
        }

        // 연속 기간으로 정의된 이벤트
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;

        if (!startDate || !endDate) return false;

        if (selectedDateString >= startDate && selectedDateString <= endDate) return true;
        return false;
    }

    // 날짜가 선택되지 않은 경우: targetMonth 기준으로 필터링
    if (targetMonth) {
        // 요일 필터 (targetMonth가 있을 때만 적용되는 것으로 보임 in original logic matchesWeekday inside filterByMonth)
        // But matchesWeekday was also inside baseFilter? No, baseFilter had its own matchesWeekday.
        // Let's apply matchesWeekday here if provided.

        if (selectedWeekday !== undefined && selectedWeekday !== null) {
            const startDateStr = event.start_date || event.date;
            const endDateStr = event.end_date || event.date;
            if (!startDateStr) return false;

            let matchFound = false;
            // 특정 날짜 배열이 있는 경우
            if (event.event_dates && event.event_dates.length > 0) {
                matchFound = event.event_dates.some(d => parseDateSafe(d).getDay() === selectedWeekday);
            } else {
                // 기간인 경우
                const start = parseDateSafe(startDateStr);
                const end = parseDateSafe(endDateStr || startDateStr);

                // 7일 이상이면 무조건 해당 요일 포함
                const oneDay = 24 * 60 * 60 * 1000;
                const diffDays = Math.round(Math.abs((end.getTime() - start.getTime()) / oneDay));
                if (diffDays >= 6) {
                    matchFound = true;
                } else {
                    // 기간 순회하며 요일 확인
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        if (d.getDay() === selectedWeekday) {
                            matchFound = true;
                            break;
                        }
                    }
                }
            }
            if (!matchFound) return false;
        }

        // Month/Year View Logic
        if (event.event_dates && event.event_dates.length > 0) {
            const currentYear = targetMonth.getFullYear();
            const currentMonthNum = targetMonth.getMonth() + 1;

            if (viewMode === "year") {
                return event.event_dates.some((dateStr) => {
                    const year = parseInt(dateStr.split("-")[0]);
                    return year === currentYear;
                });
            } else {
                const monthPrefix = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;
                return event.event_dates.some((dateStr) => dateStr.startsWith(monthPrefix));
            }
        } else {
            const startDate = event.start_date || event.date;
            const endDate = event.end_date || event.date;

            if (!startDate || !endDate) return false;

            const eventStartDate = new Date(startDate);
            const eventEndDate = new Date(endDate); // Was using strings in month view in original, Date in year view. Use strings for month view consistency?

            if (viewMode === "year") {
                const yearStart = new Date(targetMonth.getFullYear(), 0, 1);
                const yearEnd = new Date(targetMonth.getFullYear(), 11, 31);
                return eventStartDate <= yearEnd && eventEndDate >= yearStart;
            } else {
                const currentYear = targetMonth.getFullYear();
                const currentMonthNum = targetMonth.getMonth() + 1;
                const monthStartStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}-01`;
                const monthEndStr = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}-${new Date(currentYear, currentMonthNum, 0).getDate()}`;
                return startDate <= monthEndStr && endDate >= monthStartStr;
            }
        }
    }

    return true;
};
