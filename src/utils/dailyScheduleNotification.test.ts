import { describe, expect, it } from 'vitest';
import { buildDailyScheduleNotification } from './dailyScheduleNotification';

describe('daily schedule notification time-information policy', () => {
  it('does not expose event times in the body or preview item data', () => {
    const notification = buildDailyScheduleNotification([
      {
        id: 1,
        title: '저녁 소셜',
        date: '2026-08-05',
        time: '19:30',
        location: '테스트홀',
      },
    ], '2026-08-05', { receivedAt: '2026-08-05T08:30:00+09:00' });

    expect(notification.body).toBe('저녁 소셜 · 테스트홀');
    expect(notification.body).not.toContain('19:30');
    expect(notification.data.items[0]).not.toHaveProperty('time');
  });
});
