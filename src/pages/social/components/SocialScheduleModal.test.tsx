import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialSchedule } from '../types';
const mocks = vi.hoisted(() => ({ writes: [] as Array<{ method: string; data: Record<string, unknown> }>, showLoading: vi.fn(), hideLoading: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' }, isAdmin: false }) }));
vi.mock('../../../contexts/LoadingContext', () => ({ useLoading: () => mocks }));
vi.mock('../../../utils/analyticsEvents', () => ({ trackActivitySuccess: vi.fn() }));
vi.mock('../../../components/ImageCropModal', () => ({ default: () => null }));
vi.mock('../../../lib/cafe24Client', () => ({ cafe24: { from: () => {
    let data: Record<string, unknown> = {};
    const query = {
        insert: (rows: Record<string, unknown>[]) => { data = rows[0]; mocks.writes.push({ method: 'insert', data }); return query; },
        update: (value: Record<string, unknown>) => { data = value; mocks.writes.push({ method: 'update', data }); return query; },
        eq: () => query, select: () => query,
        maybeSingle: async () => ({ data: { ...data, id: 'social-id' }, error: null }),
    };
    return query;
} } }));
import SocialScheduleModal from './SocialScheduleModal';
import { getCalendarSocialDisplayText } from '../../calendar/utils/calendarEventKind';
const source: SocialSchedule = { id: 'social-id', group_id: -1, user_id: 'owner', created_at: '', updated_at: '', title: '먼데이 소셜', date: '2026-09-21', category: 'social', genre: 'DJ,소셜', location: '해피홀(신촌)', image: '/poster.webp', time: '' };
beforeEach(() => { mocks.writes.length = 0; vi.spyOn(window, 'alert').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('social registration DJ metadata', () => {
    it.each(['create', 'edit'])('saves DJs through the existing %s path and restores them on reopen', async (mode) => {
        const onSuccess = vi.fn();
        const { unmount } = render(<SocialScheduleModal isOpen onClose={vi.fn()} onSuccess={onSuccess}
            {...(mode === 'edit' ? { editSchedule: { ...source, structured_data: { djs: ['Old'], evidence: 'keep' } } } : { initialData: source })} />);
        const input = screen.getByLabelText('DJ명 (선택)');
        fireEvent.change(input, { target: { value: 'DJ BLAKE, 홍길동' } });
        expect(document.querySelector('input[type="time"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '일정 저장하기' }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(mocks.writes).toHaveLength(1);
        expect(mocks.writes[0]).toMatchObject({ method: mode === 'edit' ? 'update' : 'insert', data: { structured_data: { djs: ['BLAKE', '홍길동'] }, time: '' } });
        if (mode === 'edit') expect(mocks.writes[0].data.structured_data).toHaveProperty('evidence', 'keep');
        const saved = onSuccess.mock.calls[0][0];
        expect(getCalendarSocialDisplayText(saved)).toBe('DJ BLAKE, 홍길동');
        unmount();
        render(<SocialScheduleModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} editSchedule={saved} />);
        expect(screen.getByLabelText('DJ명 (선택)')).toHaveValue('BLAKE, 홍길동');
    });
    it('allows an unknown DJ and preserves legacy time internally without an input', async () => {
        const onSuccess = vi.fn();
        render(<SocialScheduleModal isOpen onClose={vi.fn()} onSuccess={onSuccess} editSchedule={{ ...source, time: '19:30' }} />);
        expect(screen.getByLabelText('DJ명 (선택)')).toHaveValue('');
        expect(document.querySelector('input[type="time"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '일정 저장하기' }));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(mocks.writes[0].data).toMatchObject({ structured_data: { djs: [] }, time: '19:30' });
    });
});
