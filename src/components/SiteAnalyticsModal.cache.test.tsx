import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SiteAnalyticsModal from './SiteAnalyticsModal';
import { closedAnalyticsReportId } from '../utils/analyticsReportCache';

const mocks = vi.hoisted(() => ({
    rows: new Map<string, any>(), rpc: vi.fn(), from: vi.fn(), writes: vi.fn(),
    failedTable: '', pendingRead: null as Promise<any> | null,
}));
vi.mock('../lib/cafe24Client', () => ({ cafe24: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('../utils/analyticsEngine', () => ({ isInternalAnalyticsRoute: () => false, isLikelyBotTraffic: () => false }));
const pastId = closedAnalyticsReportId('2026-09-21', '2026-09-21', new Date('2026-09-23T00:00:00Z'))!;
const emptyReport = () => ({
    report_version: 1,
    report: { summary: { total_clicks: 0, user_clicks: 0, anon_clicks: 0, daily_details: [], total_top_items: [], total_sections: [], type_breakdown: [] }, users: [], guests: [] },
});
const selectDate = (container: HTMLElement, date: string) => {
    const inputs = container.querySelectorAll('input[type="date"]');
    act(() => {
        const order = date < (inputs[0] as HTMLInputElement).value ? [1, 0] : [0, 1];
        for (const i of order) fireEvent.change(inputs[i], { target: { value: date } });
    });
};
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
    mocks.rows.clear(); mocks.failedTable = ''; mocks.pendingRead = null;
    mocks.writes.mockReset(); mocks.from.mockReset(); mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { user_list: [], guest_list: [], visitor_summary: { unique_logged_in: 0, unique_guest: 0 } }, error: null });
    mocks.writes.mockImplementation(async (row: any) => { mocks.rows.set(row.id, row); return { error: null }; });
    mocks.from.mockImplementation((table: string) => {
        let id: string | undefined;
        const query: any = {};
        for (const method of ['select', 'gte', 'lte', 'range', 'order', 'limit', 'in']) query[method] = () => query;
        query.eq = (_: string, value: string) => { id = value; return query; };
        query.maybeSingle = () => mocks.pendingRead || Promise.resolve({ data: mocks.rows.get(id!) || null, error: mocks.failedTable === table ? new Error('failed') : null });
        query.upsert = mocks.writes;
        query.then = (resolve: any) => Promise.resolve({ data: table === 'site_usage_stats' ? [{ id: 'legacy-today' }] : [], error: mocks.failedTable === table ? new Error('failed') : null }).then(resolve);
        return query;
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('closed analytics report reuse', () => {
    it('uses KST midnight and rejects open, reversed, and malformed dates', () => {
        expect(closedAnalyticsReportId('2026-09-22', '2026-09-22', new Date('2026-09-22T14:59:59Z'))).toBeNull();
        expect(closedAnalyticsReportId('2026-09-22', '2026-09-22', new Date('2026-09-22T15:00:00Z'))).toContain('2026-09-22');
        for (const [start, end] of [['2026-09-22', '2026-09-21'], ['2026-02-30', '2026-03-01'], ['', '2026-09-21']]) expect(closedAnalyticsReportId(start, end)).toBeNull();
    });
    it('restores a saved zero report without any raw query or RPC and survives reopening', async () => {
        mocks.rows.set(pastId, emptyReport());
        const view = render(<SiteAnalyticsModal isOpen={false} onClose={() => {}} />);
        view.rerender(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        mocks.from.mockClear(); mocks.rpc.mockClear();
        selectDate(view.container, '2026-09-21');
        await screen.findByText(/저장된 과거 통계/);
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['site_usage_stats']);
        view.rerender(<SiteAnalyticsModal isOpen={false} onClose={() => {}} />);
        view.rerender(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/저장된 과거 통계/);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('calculates a missing or legacy report once and explicitly rebuilds when requested', async () => {
        mocks.rows.set(pastId, { logged_in_count: 4, snapshot_time: '2026-09-21' });
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        expect(mocks.writes).not.toHaveBeenCalled(); // Today is never frozen.
        selectDate(view.container, '2026-09-21');
        await screen.findByText(/과거 통계 저장 완료/);
        expect(mocks.writes).toHaveBeenCalledTimes(1);
        const saved = mocks.rows.get(pastId);
        expect(saved.report.users).toEqual([]);
        expect(saved.report.guests).toEqual([]);
        expect(saved.snapshot_time).toBe('2026-09-21T23:59:59.999+09:00');
        mocks.rpc.mockClear();
        fireEvent.click(screen.getByRole('button', { name: '원본 기록으로 다시 계산' }));
        await waitFor(() => expect(mocks.writes).toHaveBeenCalledTimes(2));
        expect(mocks.rpc).toHaveBeenCalledWith('get_analytics_summary_v2', expect.objectContaining({ start_date: '2026-09-21T00:00:00+09:00' }));
    });
    it('persists member and guest details together with the authoritative visitor counts', async () => {
        mocks.rpc.mockResolvedValue({ data: {
            user_list: [{ user_id: 'member-1', nickname: '회원 테스트', visitCount: 1 }],
            guest_list: [{ key: 'guest-1', label: 'Guest 1' }],
            visitor_summary: { unique_logged_in: 1, unique_guest: 1 },
        }, error: null });
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/오늘이 포함된 기간/);
        selectDate(view.container, '2026-09-21');
        await screen.findByText(/과거 통계 저장 완료/);
        const { report } = mocks.rows.get(pastId);
        expect(report.summary).toMatchObject({ user_clicks: 1, anon_clicks: 1 });
        expect(report.users[0]).toMatchObject({ user_id: 'member-1', nickname: '회원 테스트' });
        expect(report.guests[0]).toMatchObject({ key: 'guest-1' });
        mocks.rpc.mockClear();
        view.rerender(<SiteAnalyticsModal isOpen={false} onClose={() => {}} />);
        view.rerender(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/저장된 과거 통계/);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(['session_logs', 'board_admins', 'pwa_installs'])('does not freeze partial results if %s fails', async table => {
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        mocks.failedTable = table;
        selectDate(view.container, '2026-09-21');
        await screen.findByRole('alert');
        expect(mocks.writes).not.toHaveBeenCalled();
        mocks.failedTable = '';
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        await screen.findByText(/과거 통계 저장 완료/);
    });
    it('requires authorized cache reads and never falls back to raw records on a read error', async () => {
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        mocks.rpc.mockClear(); mocks.failedTable = 'site_usage_stats';
        selectDate(view.container, '2026-09-21');
        await screen.findByRole('alert');
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.writes).not.toHaveBeenCalled();
    });
    it('preserves the previous report when an explicit recalculation fails', async () => {
        const saved = emptyReport(); mocks.rows.set(pastId, saved);
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        selectDate(view.container, '2026-09-21');
        await screen.findByText(/저장된 과거 통계/);
        mocks.rpc.mockResolvedValue({ error: new Error('RPC unavailable'), data: null });
        fireEvent.click(screen.getByRole('button', { name: '원본 기록으로 다시 계산' }));
        await screen.findByRole('alert');
        expect(mocks.rows.get(pastId)).toBe(saved);
        expect(mocks.writes).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        await screen.findByText(/저장된 과거 통계/);
    });
    it('keeps a successful report visible when saving fails and warns that it was not saved', async () => {
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        mocks.writes.mockResolvedValue({ error: new Error('save failed') });
        selectDate(view.container, '2026-09-21');
        await screen.findByText(/저장에 실패했습니다/);
        expect(mocks.rows.has(pastId)).toBe(false);
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('does not let a late saved response replace the newly selected day', async () => {
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('선택한 기간에 집계 대상 방문 기록이 없습니다.');
        let resolveOld!: (value: any) => void;
        mocks.pendingRead = new Promise(resolve => { resolveOld = resolve; });
        selectDate(view.container, '2026-09-21');
        mocks.pendingRead = null;
        selectDate(view.container, '2026-09-23');
        await screen.findByText(/오늘이 포함된 기간/);
        await act(async () => resolveOld({ data: emptyReport(), error: null }));
        expect(screen.queryByText(/저장된 과거 통계/)).toBeNull();
        expect(screen.getByText(/오늘이 포함된 기간/)).toBeTruthy();
    });
});
