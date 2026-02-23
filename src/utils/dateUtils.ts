/**
 * Date utility functions for event date formatting
 */

/**
 * Get current date as YYYY-MM-DD string in KST (Korea Standard Time)
 * Uses UTC+9 offset to ensure consistent date across all timezones
 */
export const getLocalDateString = (): string => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const year = kstDate.getUTCFullYear();
    const month = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kstDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/**
 * Format date string to M/D(요일) format
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Formatted date string like "12/25(월)"
 */
export const formatEventDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${date.getMonth() + 1}/${date.getDate()}(${weekDay})`;
};

/**
 * Format date range for display
 * @param startDate - Start date string
 * @param endDate - End date string (optional)
 * @returns Formatted date range string
 */
export const formatDateRange = (startDate: string, endDate?: string): string => {
    if (!startDate) return "날짜 미정";

    if (endDate && endDate !== startDate) {
        return `${formatEventDate(startDate)}~${formatEventDate(endDate)}`;
    }

    return formatEventDate(startDate);
};
