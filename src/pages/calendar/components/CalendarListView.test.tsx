import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as AppEvent } from '../../../lib/cafe24Client';
import CalendarListView from './CalendarListView';

type CalendarTestEvent = AppEvent & {
  automation?: { exception_type?: string | null };
};

function event(overrides: Partial<CalendarTestEvent>): CalendarTestEvent {
  return {
    id: 'event-id',
    title: '테스트 소셜',
    date: '2099-01-01',
    time: '',
    location: '테스트홀',
    category: 'social',
    price: '',
    image: '',
    organizer: '테스트',
    dance_scope: 'swing',
    ...overrides,
  };
}

function renderEvent(value: CalendarTestEvent) {
  render(
    <CalendarListView
      events={[value]}
      socialSchedules={[]}
      tabFilter="all"
      onEventClick={vi.fn()}
    />,
  );
}

describe('CalendarListView social category labels', () => {
  it('uses the closure label for a materialized social closure', () => {
    renderEvent(event({
      genre: '휴무',
      automation: { exception_type: 'closure' },
    }));

    expect(screen.getByText('휴무')).toHaveClass('cal-list-badge', 'list-badge--social');
  });

  it('keeps graduation and ordinary social labels unchanged', () => {
    const { unmount } = render(
      <CalendarListView
        events={[event({ genre: '졸공' })]}
        socialSchedules={[]}
        tabFilter="all"
        onEventClick={vi.fn()}
      />,
    );
    expect(screen.getByText('졸공')).toBeInTheDocument();
    unmount();

    renderEvent(event({ genre: '소셜' }));
    expect(screen.getByText('소셜')).toBeInTheDocument();
  });
});
