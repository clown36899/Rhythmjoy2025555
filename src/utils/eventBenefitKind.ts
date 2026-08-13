export type EventBenefitKind = 'free_event' | 'discount_event' | 'season_pass' | null;

const EVENT_BENEFIT_KINDS = new Set<Exclude<EventBenefitKind, null>>([
    'free_event',
    'discount_event',
    'season_pass',
]);

export function normalizeEventBenefitKind(
    value: unknown,
    eligible: unknown = true,
): EventBenefitKind {
    if (eligible !== true) return null;
    return EVENT_BENEFIT_KINDS.has(value as Exclude<EventBenefitKind, null>)
        ? value as Exclude<EventBenefitKind, null>
        : null;
}

export function eventBenefitFields(value: unknown) {
    const benefitKind = normalizeEventBenefitKind(value);
    return {
        benefit_eligible: benefitKind !== null,
        benefit_kind: benefitKind,
    };
}

export function getEventBenefitKindLabel(value: unknown, eligible: unknown = true) {
    const benefitKind = normalizeEventBenefitKind(value, eligible);
    if (benefitKind === 'free_event') return '무료';
    if (benefitKind === 'discount_event') return '할인 이벤트';
    if (benefitKind === 'season_pass') return '정기권';
    return '일반';
}
