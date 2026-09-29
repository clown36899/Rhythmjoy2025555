import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./generic-data-api.js', () => ({
  loadCafe24TableRows: vi.fn(), saveCafe24TableRow: vi.fn(), deleteCafe24TableRows: vi.fn(),
}));
vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => ({ execute: async () => [[]] }) }));
import { loadCafe24TableRows, saveCafe24TableRow, deleteCafe24TableRows } from './generic-data-api.js';
import { planRegularSocialReconciliation, runRegularSocialReconciliation } from './regular-social-reconciler.js';

beforeEach(() => {
  vi.resetAllMocks();
  const events = planRegularSocialReconciliation({ events: [] }).creates.map((event) => ({ ...event, link1: '', link_name1: '' }));
  loadCafe24TableRows.mockImplementation(async (table) => table === 'events' ? events : []);
});
it('upserts source-link updates without deleting the same event IDs', async () => {
  await runRegularSocialReconciliation();
  expect(saveCafe24TableRow).toHaveBeenCalled();
  expect(deleteCafe24TableRows).not.toHaveBeenCalled();
});
it('does not erase existing events if saving an update fails', async () => {
  saveCafe24TableRow.mockRejectedValue(new Error('storage unavailable'));
  await expect(runRegularSocialReconciliation()).rejects.toThrow('storage unavailable');
  expect(deleteCafe24TableRows).not.toHaveBeenCalled();
});
it('dry run performs no mutations', async () => {
  await runRegularSocialReconciliation({ dryRun: true });
  expect(saveCafe24TableRow).not.toHaveBeenCalled();
  expect(deleteCafe24TableRows).not.toHaveBeenCalled();
});
