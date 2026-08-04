import { describe, expect, it } from 'vitest';
import { isEventRegistrationImageRequired } from './eventRegistrationRules';

describe('event registration image rules', () => {
  it('allows benefit events to register without an image', () => {
    expect(isEventRegistrationImageRequired('free_event')).toBe(false);
    expect(isEventRegistrationImageRequired('discount_event')).toBe(false);
    expect(isEventRegistrationImageRequired('season_pass')).toBe(false);
  });

  it('keeps images required for ordinary events', () => {
    expect(isEventRegistrationImageRequired(null)).toBe(true);
    expect(isEventRegistrationImageRequired(undefined)).toBe(true);
  });
});
