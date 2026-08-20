import type { Event } from '../lib/cafe24Client';

export function normalizeBenefitEventDate(value: unknown) {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

export function getBenefitEventDateCandidates(event: Event) {
    return [
        ...(Array.isArray(event.event_dates) ? event.event_dates : []),
        event.start_date,
        event.date,
        event.end_date,
    ]
        .map(normalizeBenefitEventDate)
        .filter(Boolean)
        .sort();
}

export function getBenefitEventDisplayDate(event: Event, today: string) {
    const dates = getBenefitEventDateCandidates(event);
    return dates.find((date) => date >= today) || dates[0] || '';
}

export function isPastBenefitEvent(event: Event, today: string) {
    const dates = getBenefitEventDateCandidates(event);
    const endDate = normalizeBenefitEventDate(event.end_date);
    const lastDate = [endDate, ...dates].filter(Boolean).sort().at(-1) || '';
    return Boolean(lastDate && lastDate < today);
}

export function isBenefitEvent(event: Event) {
    return event.benefit_eligible === true;
}

export function getCurrentBenefitEventIds(events: Event[], today: string) {
    return [...new Set(
        events
            .filter((event) => isBenefitEvent(event) && !isPastBenefitEvent(event, today))
            .map((event) => String(event.id || ''))
            .filter(Boolean),
    )].sort();
}
