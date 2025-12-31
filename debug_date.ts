
const getLocalDateString = (date: Date = new Date()) => {
    // 1. UTC 시간에 9시간을 더해 한국 날짜 객체를 만듦
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    // 2. ISO 문자열로 변환 (YYYY-MM-DDTHH:mm:ss.sssZ)
    // 3. 앞의 10자리(YYYY-MM-DD)만 자름
    return kstDate.toISOString().split('T')[0];
};

const getKSTDay = (date: Date = new Date()) => {
    // 1. UTC 시간에 9시간을 더해 한국 날짜 객체를 만듦
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    // 2. 요일 반환 (0: 일요일, 1: 월요일, ..., 6: 토요일)
    return kstDate.getUTCDay();
};

const run = () => {
    // Simulate Dec 31, 2025 23:00 KST (14:00 UTC)
    // 2025-12-31 14:00:00 UTC
    const mockNow = new Date('2025-12-31T14:00:00Z');

    console.log("Mock Now (UTC):", mockNow.toISOString());

    const todayStr = getLocalDateString(mockNow);
    console.log("todayStr (Should be 2025-12-31):", todayStr);

    const kstDay = getKSTDay(mockNow);
    console.log("kstDay (Should be 3/Wed): Wait. Dec 31 2025 is Wednesday. Dec 31 2024 is Tuesday.");
    // Wait. User said "Today is Dec 31".
    // Current year is 2025? Or 2024?
    // Metadata says 2025-12-31.
    // Dec 31 2025 is WEDNESDAY.
    // Dec 31 2024 is TUESDAY.
    // User said "Today is Dec 31 (Tuesday)".
    // This implies THE YEAR IS 2024!
    // But metadata time says 2025?
    // "The current local time is: 2025-12-31T..."

    // If User says Dec 31 is Tuesday, then user thinks it's 2024.
    // If system says 2025, it's 2025.
    // Let's check Dec 31 2025.
    // If it's Wed.

    // Logic:
    const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;
    console.log("daysFromMonday:", daysFromMonday);

    const todayDate = new Date(todayStr); // UTC 00:00
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - daysFromMonday);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    console.log("weekStartStr:", getLocalDateString(weekStart));
    console.log("weekEndStr:", getLocalDateString(weekEnd));
}

run();
