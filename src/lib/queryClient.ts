import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60000, // 1분 - 데이터가 "신선한" 상태로 유지되는 시간
            gcTime: 1000 * 60 * 60 * 24, // 24시간 - 캐시 보관 시간 (영속성 고려)
            refetchOnWindowFocus: true, // 윈도우 포커스 시 자동 리페칭
            retry: 1, // 실패 시 1번만 재시도
        },
    },
});

// 영속성(Persistence) 설정: localStorage에 캐시 저장
if (typeof window !== 'undefined') {
    const persister = createSyncStoragePersister({
        storage: window.localStorage,
        key: 'RHYTHMJOY_QUERY_CACHE',
    });

    persistQueryClient({
        queryClient,
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24시간
    });
}
