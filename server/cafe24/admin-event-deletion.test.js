import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('./mysql-pool.js', () => ({ getMysqlPool: () => mocks }));
import {
  assertEventNotAdminDeleted, buildAdminDeletedEventRow, deleteEventsAsAdmin,
  findAdminDeletedEvent, withEventMutationLock,
} from './admin-event-deletion.js';
import { saveCafe24TableRow } from './generic-data-api.js';
import { saveEvent } from './events-api.js';

const admin = { id: 'admin', is_admin: true };
const event = { id: 'old', title: '소셜', category: 'social', date: '2026-09-13', location: '샘플홀' };
let connection;
beforeEach(() => {
  connection = {
    execute: vi.fn(async (sql) => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]]),
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  };
  mocks.getConnection.mockReset().mockResolvedValue(connection);
});

it('commits the excluded ledger and event deletion together, releasing the lock after commit', async () => {
  await deleteEventsAsAdmin([event], admin);
  const writes = connection.execute.mock.calls.filter(([sql]) => /INSERT|DELETE/.test(sql));
  expect(writes).toHaveLength(2);
  const marker = JSON.parse(writes[0][1][1]);
  expect(marker.status).toBe('excluded');
  expect(findAdminDeletedEvent(event, [marker])).toBe(marker);
  expect(connection.commit).toHaveBeenCalledOnce();
  const releaseCall = connection.execute.mock.calls.findIndex(([sql]) => sql.includes('RELEASE_LOCK'));
  expect(connection.execute.mock.invocationCallOrder[releaseCall]).toBeGreaterThan(connection.commit.mock.invocationCallOrder[0]);
  expect(connection.release).toHaveBeenCalledOnce();
});

it('rolls back a failed ledger write without deleting the event', async () => {
  connection.execute.mockImplementation(async (sql) => {
    if (sql.includes('INSERT INTO generic_records')) throw new Error('ledger unavailable');
    return [[{ acquired: 1 }]];
  });
  await expect(deleteEventsAsAdmin([event], admin)).rejects.toThrow('ledger unavailable');
  expect(connection.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).not.toHaveBeenCalled();
});

it('rolls back the deletion record too when deleting the event fails', async () => {
  connection.execute.mockImplementation(async (sql) => {
    if (sql.startsWith('DELETE')) throw new Error('delete failed');
    return [[{ acquired: 1 }]];
  });
  await expect(deleteEventsAsAdmin([event], admin)).rejects.toThrow('delete failed');
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).not.toHaveBeenCalled();
});

it('fails closed on lock contention and does not release a lock owned by another connection', async () => {
  connection.execute.mockResolvedValue([[{ acquired: 0 }]]);
  const operation = vi.fn();
  await expect(withEventMutationLock(operation)).rejects.toMatchObject({ statusCode: 503 });
  expect(operation).not.toHaveBeenCalled();
  expect(connection.execute).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledOnce();
});

it('blocks stale scheduled, manual and external writes at both shared persistence boundaries', async () => {
  const marker = buildAdminDeletedEventRow(event, admin);
  connection.execute.mockImplementation(async (sql) => sql.includes('GET_LOCK')
    ? [[{ acquired: 1 }]] : sql.startsWith('SELECT data_json') ? [[{ data_json: JSON.stringify(marker) }]] : [[]]);
  for (const write of [
    () => saveCafe24TableRow('events', { ...event, id: 'new-generated-id' }),
    () => saveEvent({ ...event, id: 'new-manual-id' }),
    () => saveEvent({ ...event, id: 'new-external-id' }, connection),
  ]) {
    await expect(write()).rejects.toMatchObject({ code: 'ADMIN_DELETED_EVENT', statusCode: 409 });
  }
  expect(connection.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO events'))).toBe(false);
  await expect(assertEventNotAdminDeleted({ ...event, id: 'rsf', category: 'event', title: 'RSF' }, connection)).resolves.toBeUndefined();
});

it('requires an administrator and preserves unrelated dates, activities and dance scenes', async () => {
  await expect(deleteEventsAsAdmin([event], { id: 'owner' })).rejects.toThrow('Administrator required');
  expect(mocks.getConnection).not.toHaveBeenCalled();
  const marker = buildAdminDeletedEventRow({ ...event, dance_scope: 'swing' }, admin);
  for (const patch of [{ date: '2026-09-20' }, { category: 'class' }, { genre: '졸공' }, { dance_scope: 'salsa' }]) {
    expect(findAdminDeletedEvent({ ...event, id: 'different', ...patch }, [marker])).toBeNull();
  }
  expect(findAdminDeletedEvent(event, [{ ...marker, status: 'pending' }])).toBeNull();
});
