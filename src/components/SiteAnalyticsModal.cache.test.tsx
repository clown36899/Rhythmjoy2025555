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
        fireEvent.click(screen.getByRole('button', {name:'이전 날짜'}));
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
        fireEvent.click(screen.getByRole('button',{name:'오늘 통계 즉시 갱신'}));
        await screen.findByText(/마감된 일별 통계/);
        expect(mocks.rpc).toHaveBeenLastCalledWith('create_usage_snapshot',expect.objectContaining({report:true}));
        expect(mocks.from).not.toHaveBeenCalled();
    });
    it('distinguishes live data from a closed daily report', async () => {
        mocks.rpc.mockResolvedValue(saved('live'));
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/오늘 통계는 서버에서 1분마다 갱신/);
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
        fireEvent.click(screen.getByRole('button', {name:'이전 날짜'}));
        await screen.findByText(/마감된 일별 통계/);
        await act(async()=>resolveOld(saved('live')));
        expect(screen.queryByText(/오늘 통계는 서버에서 1분마다 갱신/)).toBeNull();
    });
    it('bounds read waiting so a hanging request cannot leave the loading state forever', async () => {
        vi.useFakeTimers(); mocks.rpc.mockReturnValue(new Promise(()=>{}));
        const pending = expect(loadAnalyticsReport('2026-09-22','2026-09-22')).rejects.toThrow('초과');
        await vi.advanceTimersByTimeAsync(30000); await pending;
    });
    it('loads visitor details only when opened and retrieves the next page on request', async () => {
        mocks.rpc.mockImplementation(async (_name, args) => {
            if (args.report_part === 'users') return {data:{status:'ready',total:30,report:{users:Array.from({length:args.offset ? 5 : 25},(_,i)=>({user_id:`u-${i+args.offset}`,nickname:`Member ${i+args.offset}`,visitCount:1,visitLogs:[]})),guests:[]}},error:null};
            const result:any=saved(); result.data.userCount=30;
            result.data.report.summary.total_clicks=30;result.data.report.summary.user_clicks=30;
            return result;
        });
        const view=render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/마감된 일별 통계/);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(screen.getByText('고유 방문자')).toBeTruthy();
        expect(screen.getByText('방문 횟수')).toBeTruthy();
        expect(screen.queryByText('회원 전환')).toBeNull();
        fireEvent.click(screen.getByRole('button', {name:/로그인 30/}));
        await screen.findByText('Member 0');
        expect(mocks.rpc).toHaveBeenLastCalledWith('get_analytics_summary_v2',expect.objectContaining({report_part:'users',offset:0}));
        fireEvent.click(screen.getByRole('button',{name:'더 보기 (25/30)'}));
        await screen.findByText('Member 29');
        expect(mocks.rpc).toHaveBeenLastCalledWith('get_analytics_summary_v2',expect.objectContaining({report_part:'users',offset:25}));
    });
    it('shows delayed refresh honestly instead of calling a stored live snapshot realtime', async () => {
        const result:any=saved('live_snapshot'); result.data.stale=true; mocks.rpc.mockResolvedValue(result);
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText(/오늘 통계 자동 갱신이 지연/);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });

    it('uses the displayed annual range for CSV and keeps date reads separate from rebuilding', async () => {
        const result:any = saved();
        result.data.report.summary.user_clicks = 1;
        result.data.report.summary.daily_details = [{date:'2026-09-22',total:4,user:1,guest:3}];
        mocks.rpc.mockResolvedValue(result);
        render(<SiteAnalyticsModal isOpen onClose={() => {}} />);
        await screen.findByText('고유 방문자');
        expect(screen.getByRole('button',{name:'다음 날짜'}).hasAttribute('disabled')).toBe(true);
        fireEvent.click(screen.getByRole('button',{name:'최근 1년'}));
        await screen.findByText('고유 방문자');
        const args = mocks.rpc.mock.calls.at(-1)![1];
        const create = vi.fn(()=>'blob:analytics'); const revoke = vi.fn();
        Object.defineProperty(URL, 'createObjectURL', {configurable:true,value:create});
        Object.defineProperty(URL, 'revokeObjectURL', {configurable:true,value:revoke});
        let filename = '';
        const click = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this: HTMLAnchorElement){filename=this.download;});
        fireEvent.click(screen.getByRole('button',{name:'일별 활동 CSV 다운로드'}));
        expect(filename).toBe(`analytics-${args.start_date.slice(0,10)}-${args.end_date.slice(0,10)}.csv`);
        expect(mocks.rpc.mock.calls.every(([name])=>name==='get_analytics_summary_v2')).toBe(true);
        expect(revoke).toHaveBeenCalledWith('blob:analytics');
        click.mockRestore();
    });

});
