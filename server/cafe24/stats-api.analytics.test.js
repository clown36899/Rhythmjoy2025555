import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ all: vi.fn(), byId: vi.fn(), byField: vi.fn(), save: vi.fn() }));
vi.mock('./generic-data-api.js', () => ({ loadCafe24TableRows: db.all, loadCafe24TableRowsByRecordId: db.byId, loadCafe24TableRowsByJsonField: db.byField, saveCafe24TableRow: db.save }));
import { saveCafe24AnalyticsCompat } from './stats-api.js';
const req = { headers: {}, ip: '127.0.0.1' };
beforeEach(() => { for (const fn of Object.values(db)) fn.mockReset(); db.byId.mockResolvedValue([]); db.byField.mockResolvedValue([]); db.save.mockResolvedValue({}); });
describe('analytics session persistence lookup', () => {
    it('updates a canonical session through its key without a full scan', async () => {
        db.byId.mockResolvedValue([{ id:'old-id',session_id:'session-1',session_start:'2026-09-23T01:00:00Z',referrer:'original',page_views:4 }]);
        await saveCafe24AnalyticsCompat({action:'end',session_id:'session-1',duration_seconds:120},req);
        expect(db.byId).toHaveBeenCalledWith('session_logs','session-1');
        expect(db.byField).not.toHaveBeenCalled(); expect(db.all).not.toHaveBeenCalled();
        expect(db.save).toHaveBeenCalledWith('session_logs',expect.objectContaining({id:'old-id',session_start:'2026-09-23T01:00:00Z',referrer:'original',page_views:4,duration_seconds:120}),['session_id']);
    });
    it('preserves imported UUID-keyed sessions through the existing legacy field lookup', async () => {
        db.byField.mockResolvedValue([{id:'legacy-uuid',session_id:'legacy',session_start:'2026-09-22T23:00:00Z',analytics_excluded:true}]);
        await saveCafe24AnalyticsCompat({action:'end',session_id:'legacy'},req);
        expect(db.byField).toHaveBeenCalledWith('session_logs','session_id','legacy');
        expect(db.save).toHaveBeenCalledWith('session_logs',expect.objectContaining({id:'legacy-uuid',analytics_excluded:true,session_start:'2026-09-22T23:00:00Z'}),['session_id']);
        expect(db.all).not.toHaveBeenCalled();
    });
    it('creates a missing session but never overwrites one after lookup failure', async () => {
        await saveCafe24AnalyticsCompat({action:'start',session_id:'new',session_start:'2026-09-23T01:00:00Z'},req);
        expect(db.save).toHaveBeenCalledTimes(1); db.save.mockClear();
        db.byId.mockRejectedValueOnce(new Error('database unavailable'));
        await expect(saveCafe24AnalyticsCompat({action:'end',session_id:'new'},req)).rejects.toThrow('database unavailable');
        expect(db.save).not.toHaveBeenCalled(); expect(db.all).not.toHaveBeenCalled();
    });
});
