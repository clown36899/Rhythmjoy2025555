import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('FullEventCalendar social row alignment', () => {
  it('aligns a non-social first card to the social rounded container, not its badge', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'src/pages/calendar/components/FullEventCalendar.tsx'),
      'utf8',
    );
    const styles = readFileSync(
      resolve(process.cwd(), 'src/pages/calendar/styles/FullEventCalendar.css'),
      'utf8',
    );

    expect(component).toContain("socialEvents.length > 0 ? 'has-social-events' : 'has-no-social-events'");
    expect(styles).toContain('--calendar-social-section-top-offset: calc(');
    expect(styles).toContain('margin: var(--calendar-social-section-top-offset) 1px 3px;');
    expect(styles).toContain(
      '.calendar-cell-fullscreen-body.has-no-social-events > .calendar-fullscreen-event-card:first-child',
    );
    expect(styles).toContain('margin-top: var(--calendar-social-section-top-offset);');
  });

  it('masks the underlying mobile date pill at the sticky weekday boundary', () => {
    const pageStyles = readFileSync(
      resolve(process.cwd(), 'src/pages/calendar/styles/CalendarPage.css'),
      'utf8',
    );

    expect(pageStyles).toContain('box-shadow: 0 5px 0 var(--cal-sample-bg);');
  });
});
