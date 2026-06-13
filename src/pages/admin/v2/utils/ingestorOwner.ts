import type { Cafe24Client } from '../../../../lib/cafe24ClientTypes';

let cachedOwnerUserId: string | null = null;

export async function getIngestorOwnerUserId(cafe24: Cafe24Client): Promise<string> {
  if (cachedOwnerUserId) return cachedOwnerUserId;

  const { data: admins, error: adminError } = await cafe24
    .from('board_admins' as never)
    .select('user_id')
    .order('created_at', { ascending: true })
    .limit(1);

  if (adminError) {
    throw new Error(`관리자 작성자 계정 조회 실패: ${adminError.message}`);
  }

  const adminUserId = (admins as Array<{ user_id?: string }> | null)?.[0]?.user_id;
  if (adminUserId) {
    cachedOwnerUserId = adminUserId;
    return adminUserId;
  }

  throw new Error('관리자 작성자 계정을 찾을 수 없습니다. board_admins 설정을 확인하세요.');
}
