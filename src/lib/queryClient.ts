import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60000, // 1분 - 데이터가 "신선한" 상태로 유지되는 시간
            gcTime: 3600000, // 1시간 - 캐시 보관 시간 (구 cacheTime)
            refetchOnWindowFocus: true, // 윈도우 포커스 시 자동 리페칭
            retry: 1, // 실패 시 1번만 재시도
        },
    },
});
