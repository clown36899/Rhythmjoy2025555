import { useEffect, useState } from 'react';

/**
 * PWA 중복 실행 감지 훅
 * 브라우저와 PWA 앱이 동시에 실행 중인지 확인합니다.
 */
export function usePWADuplicateDetection() {
    const [isDuplicateDetected, setIsDuplicateDetected] = useState(false);

    useEffect(() => {
        // Broadcast Channel이 지원되지 않으면 감지 불가
        if (typeof BroadcastChannel === 'undefined') {
            return;
        }

        const channel = new BroadcastChannel('pwa-instance-check');
        let responseReceived = false;

        // 다른 인스턴스로부터 응답 수신
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'pong') {
                responseReceived = true;
                setIsDuplicateDetected(true);
                console.warn('[PWA Detection] 🔴 Duplicate instance detected!');
            } else if (event.data.type === 'ping') {
                // 다른 인스턴스가 확인 요청을 보냄 -> 응답
                channel.postMessage({ type: 'pong' });
            }
        };

        channel.addEventListener('message', handleMessage);

        // 다른 인스턴스가 있는지 확인 (ping 전송)
        channel.postMessage({ type: 'ping' });

        // 500ms 후에도 응답이 없으면 단독 실행 중
        const timeoutId = setTimeout(() => {
            if (!responseReceived) {
                console.log('[PWA Detection] ✅ Single instance running');
                setIsDuplicateDetected(false);
            }
        }, 500);

        return () => {
            clearTimeout(timeoutId);
            channel.removeEventListener('message', handleMessage);
            channel.close();
        };
    }, []);

    return isDuplicateDetected;
}
