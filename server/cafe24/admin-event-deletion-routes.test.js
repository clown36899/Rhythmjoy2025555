import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('./auth-api.js', () => ({ getCurrentUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock('./generic-data-api.js', () => ({
  loadCafe24TableRows: vi.fn(), saveCafe24TableRow: vi.fn(), deleteCafe24TableRows: vi.fn(),
}));
vi.mock('./admin-event-deletion.js', async (importOriginal) => ({
  ...await importOriginal(), deleteEventsAsAdmin: vi.fn(),
}));
vi.mock('./upload-cleanup.js', () => ({ removeEventUploads: vi.fn() }));

import { getCurrentUser } from './auth-api.js';
import { loadCafe24TableRows, deleteCafe24TableRows } from './generic-data-api.js';
import { deleteEventsAsAdmin } from './admin-event-deletion.js';
import { removeEventUploads } from './upload-cleanup.js';
import { cafe24DeleteEventFunction } from './function-api.js';

const event = { id: 'regular-social:hall:2026-09-13', title: '소셜', category: 'social', user_id: 'owner' };
let response;
beforeEach(() => {
  vi.resetAllMocks();
  loadCafe24TableRows.mockResolvedValue([event]);
  removeEventUploads.mockResolvedValue({ count: 0, urls: [], storagePath: null });
  response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
});

it('connects the actual modal/list legacy delete endpoint to durable administrator deletion', async () => {
  const admin = { id: 'admin', is_admin: true };
  getCurrentUser.mockResolvedValue(admin);
  await cafe24DeleteEventFunction({ body: { eventId: `social-${event.id}` } }, response);
  expect(deleteEventsAsAdmin).toHaveBeenCalledWith([event], admin);
  expect(deleteCafe24TableRows).not.toHaveBeenCalled();
  expect(removeEventUploads.mock.invocationCallOrder[0]).toBeGreaterThan(deleteEventsAsAdmin.mock.invocationCallOrder[0]);
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, deletedEventId: event.id }));
});

it('does not delete uploads or report success when durable deletion fails', async () => {
  getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true });
  deleteEventsAsAdmin.mockRejectedValue(new Error('storage failed'));
  await expect(cafe24DeleteEventFunction({ body: { eventId: event.id } }, response)).rejects.toThrow('storage failed');
  expect(removeEventUploads).not.toHaveBeenCalled();
  expect(response.json).not.toHaveBeenCalled();
});

it('retains ordinary owner deletion without creating administrator suppression', async () => {
  getCurrentUser.mockResolvedValue({ id: 'owner', is_admin: false });
  await cafe24DeleteEventFunction({ body: { eventId: event.id } }, response);
  expect(deleteCafe24TableRows).toHaveBeenCalledWith('events', [event]);
  expect(deleteEventsAsAdmin).not.toHaveBeenCalled();
});

it('denies another user before all deletion side effects', async () => {
  getCurrentUser.mockResolvedValue({ id: 'other', is_admin: false });
  await cafe24DeleteEventFunction({ body: { eventId: event.id } }, response);
  expect(response.status).toHaveBeenCalledWith(403);
  expect(deleteEventsAsAdmin).not.toHaveBeenCalled();
  expect(deleteCafe24TableRows).not.toHaveBeenCalled();
  expect(removeEventUploads).not.toHaveBeenCalled();
});
