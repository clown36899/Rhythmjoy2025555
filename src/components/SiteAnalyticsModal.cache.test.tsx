import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SiteAnalyticsModal from './SiteAnalyticsModal';
import { loadAnalyticsReport } from '../utils/analyticsReportCache';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../lib/cafe24Client', () => ({ cafe24: mocks }));
const saved = (source = 'daily_snapshot') => ({ data: { status: 'ready', source, report: {
    summary: { total_clicks: 0, user_clicks: 0, anon_clicks: 0, daily_details: [], total_top_items: [], total_sections: [], type_breakdown: [] }, users: [], guests: [],
} }, error: null });
beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue(saved()); mocks.from.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('server-owned analytics report UI', () => {
    it('only reads the report RPC, including when moving to a previous day', async () => {
        const view = render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/마감된 일별 통계/);
        fireEvent.click(view.container.querySelector('.date-navigator button')!);
        await screen.findByText(/마감된 일별 통계/);
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
        expect(mocks.rpc).toHaveBeenLastCalledWith('get_analytics_summary_v2', expect.objectContaining({ report: true }));
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('shows a missing scheduled report without calculating or storing anything in the browser', async () => {
        mocks.rpc.mockResolvedValue({ data: {status:'pending',missingDays:['2026-09-22']},error:null });
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('일별 통계가 아직 준비되지 않았습니다.');
        expect(screen.queryByText('통계 불러오는 중...')).toBeNull();
        expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.from).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button',{name:'다시 조회'}));
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
    });
    it('uses a mutation RPC only for an explicit administrator rebuild', async () => {
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/마감된 일별 통계/);
        fireEvent.click(screen.getByRole('button',{name:'원본 기록으로 통계 다시 만들기'}));
        await screen.findByText(/마감된 일별 통계/);
        expect(mocks.rpc).toHaveBeenLastCalledWith('create_usage_snapshot',expect.objectContaining({report:true}));
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('distinguishes live data from a closed daily report', async () => {
        mocks.rpc.mockResolvedValue(saved('live'));
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/오늘 기록과 마감된 일별 자료/);
    });
    it('exposes read failure and retries without mutating saved reports', async () => {
        mocks.rpc.mockResolvedValueOnce({data:null,error:new Error('unavailable')});
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button',{name:'다시 시도'}));
        await screen.findByText(/마감된 일별 통계/);
        expect(mocks.rpc.mock.calls.every(([name])=>name==='get_analytics_summary_v2')).toBe(true);
    });
    it('discards late responses after a date change', async () => {
        let resolveOld!: (value: any) => void;
        mocks.rpc.mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;}));
        const view=render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        fireEvent.click(view.container.querySelector('.date-navigator button')!);
        await screen.findByText(/마감된 일별 통계/);
        await act(async()=>resolveOld(saved('live')));
        expect(screen.queryByText(/오늘 기록과 마감된 일별 자료/)).toBeNull();
    });
    it('bounds read waiting so a hanging request cannot leave the loading state forever', async () => {
        vi.useFakeTimers(); mocks.rpc.mockReturnValue(new Promise(()=>{}));
        const pending = expect(loadAnalyticsReport('2026-09-22','2026-09-22')).rejects.toThrow('초과');
        await vi.advanceTimersByTimeAsync(30000); await pending;
    });
});
