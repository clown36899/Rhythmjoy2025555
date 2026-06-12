import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  applyEventMutationToQueryCache,
  mergeEventIntoArray,
  removeEventFromArray,
} from './eventMutationSync';

describe('eventMutationSync', () => {
  it('patches events query data immediately on update', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['events', 'test'], [
      { id: 1, title: 'old title', date: '2026-06-20' },
    ]);

    applyEventMutationToQueryCache(queryClient, {
      id: 1,
      event: { id: 1, title: 'new title', date: '2026-06-20' },
    }, 'updated');

    expect(queryClient.getQueryData<any[]>(['events', 'test'])?.[0].title).toBe('new title');
  });

  it('removes calendar cached events when an update moves them out of range', () => {
    const queryClient = new QueryClient();
    const key = ['calendar-events', 'test-version', 'swing', '2026-06-01', '2026-06-30'];
    queryClient.setQueryData(key, {
      events: [{ id: 7, title: 'June event', date: '2026-06-20' }],
      socialSchedules: [],
    });

    applyEventMutationToQueryCache(queryClient, {
      id: 7,
      event: { id: 7, title: 'July event', date: '2026-07-20', start_date: '2026-07-20', end_date: '2026-07-20' },
    }, 'updated');

    expect(queryClient.getQueryData<any>(key).events).toEqual([]);
  });

  it('inserts created events into matching calendar cache ranges', () => {
    const queryClient = new QueryClient();
    const key = ['calendar-events', 'test-version', 'swing', '2026-06-01', '2026-06-30'];
    queryClient.setQueryData(key, {
      events: [],
      socialSchedules: [],
    });

    applyEventMutationToQueryCache(queryClient, {
      event: {
        id: 'evt-13',
        title: 'June social',
        date: '2026-06-13',
        start_date: '2026-06-13',
        end_date: '2026-06-13',
      },
    }, 'created');

    const cached = queryClient.getQueryData<any>(key);
    expect(cached.events).toHaveLength(1);
    expect(cached.events[0].id).toBe('evt-13');
    expect(cached.socialSchedules).toEqual([]);
  });

  it('does not insert created events into non-matching calendar cache ranges', () => {
    const queryClient = new QueryClient();
    const key = ['calendar-events', 'test-version', 'swing', '2026-07-01', '2026-07-31'];
    queryClient.setQueryData(key, {
      events: [],
      socialSchedules: [],
    });

    applyEventMutationToQueryCache(queryClient, {
      event: {
        id: 'evt-13',
        title: 'June social',
        date: '2026-06-13',
        start_date: '2026-06-13',
        end_date: '2026-06-13',
      },
    }, 'created');

    expect(queryClient.getQueryData<any>(key).events).toEqual([]);
  });

  it('merges and removes local arrays by normalized event id', () => {
    const rows = [{ id: 'social-42', title: 'old' }];

    expect(mergeEventIntoArray(rows, {
      id: 42,
      event: { id: 42, title: 'new' },
    })[0]).toMatchObject({ id: 'social-42', title: 'new' });

    expect(removeEventFromArray(rows, { eventId: 42 })).toEqual([]);
  });
});
