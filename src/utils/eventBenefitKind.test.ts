import { describe, expect, it } from 'vitest';
import {
    eventBenefitFields,
    getEventBenefitKindLabel,
    normalizeEventBenefitKind,
} from './eventBenefitKind';

describe('event benefit kind', () => {
    it('normalizes supported benefit values only when the event is eligible', () => {
        expect(normalizeEventBenefitKind('discount_event', true)).toBe('discount_event');
        expect(normalizeEventBenefitKind('season_pass', true)).toBe('season_pass');
        expect(normalizeEventBenefitKind('discount_event', false)).toBeNull();
        expect(normalizeEventBenefitKind('unknown', true)).toBeNull();
    });

    it('builds a consistent payload when an event is changed back to general', () => {
        expect(eventBenefitFields(null)).toEqual({
            benefit_eligible: false,
            benefit_kind: null,
        });
        expect(getEventBenefitKindLabel(null)).toBe('일반');
    });
});
