export type EventRegistrationBenefitKind = 'free_event' | 'discount_event' | 'season_pass' | null | undefined;

export function isEventRegistrationImageRequired(benefitKind: EventRegistrationBenefitKind) {
  return !['free_event', 'discount_event', 'season_pass'].includes(String(benefitKind || ''));
}
