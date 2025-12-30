import React, { useState, useEffect } from 'react';
import {
    subscribeToPush,
    unsubscribeFromPush,
    getPushSubscription,
    getNotificationPermission,
    setBadge,
    clearBadge,
    showTestNotification
} from '../lib/pushNotifications';
import './PushNotificationTest.css';

export const PushNotificationTest: React.FC = () => {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [badgeCount, setBadgeCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 초기 상태 확인
    useEffect(() => {
        checkSubscriptionStatus();
    }, []);

    const checkSubscriptionStatus = async () => {
        console.log('🔍 구독 상태 확인 중...');

        // Service Worker 상태 확인
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            console.log('Service Worker 등록 상태:', registration ? '등록됨 ✅' : '미등록 ❌');
            if (registration) {
                console.log('Service Worker 상태:', registration.active ? 'Active ✅' : 'Not Active ❌');
            }
        } else {
            console.warn('⚠️ Service Worker를 지원하지 않는 브라우저입니다');
        }

        const subscription = await getPushSubscription();
        console.log('푸시 구독 상태:', subscription ? '구독됨 ✅' : '미구독 ❌');

        const currentPermission = getNotificationPermission();
        console.log('알림 권한:', currentPermission);

        setIsSubscribed(!!subscription);
        setPermission(currentPermission);
    };

    const handleSubscribe = async () => {
        setLoading(true);
        setError(null);
        try {
            await subscribeToPush();
            setIsSubscribed(true);
            setPermission(getNotificationPermission());
            alert('✅ 푸시 알림 구독 완료!');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '구독 실패';
            setError(errorMessage);
            alert('❌ ' + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleUnsubscribe = async () => {
        setLoading(true);
        setError(null);
        try {
            await unsubscribeFromPush();
            setIsSubscribed(false);
            alert('✅ 푸시 알림 구독 해제 완료!');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '구독 해제 실패';
            setError(errorMessage);
            alert('❌ ' + errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleSendTestNotification = async () => {
        console.log('🔔 테스트 알림 발송 시작');
        console.log('현재 상태:', {
            isSubscribed,
            permission,
            serviceWorkerSupported: 'serviceWorker' in navigator,
            notificationSupported: 'Notification' in window
        });

        setError(null);
        try {
            await showTestNotification(
                '🎉 신규 이벤트 등록!',
                '새로운 댄스 이벤트가 등록되었습니다. 지금 확인해보세요!',
                '/'
            );
            console.log('✅ 알림 발송 성공');
            alert('✅ 테스트 알림 발송 완료!');
        } catch (err) {
            console.error('❌ 알림 발송 실패:', err);
            const errorMessage = err instanceof Error ? err.message : '알림 발송 실패';
            setError(errorMessage);
            alert('❌ ' + errorMessage);
        }
    };

    const handleIncreaseBadge = async () => {
        const newCount = badgeCount + 1;
        setBadgeCount(newCount);
        await setBadge(newCount);
    };

    const handleDecreaseBadge = async () => {
        const newCount = Math.max(0, badgeCount - 1);
        setBadgeCount(newCount);
        if (newCount === 0) {
            await clearBadge();
        } else {
            await setBadge(newCount);
        }
    };

    const handleClearBadge = async () => {
        setBadgeCount(0);
        await clearBadge();
    };

    const getPermissionStatus = () => {
        switch (permission) {
            case 'granted':
                return { text: '허용됨 ✅', className: 'granted' };
            case 'denied':
                return { text: '거부됨 ❌', className: 'denied' };
            default:
                return { text: '미설정 ⚠️', className: 'default' };
        }
    };

    const permissionStatus = getPermissionStatus();

    return (
        <div className="push-notification-test">
            <div className="test-header">
                <h2>🔔 푸시 알림 테스트</h2>
                <p className="test-description">
                    PWA 앱 설치 후 푸시 알림과 배지 기능을 테스트할 수 있습니다
                </p>
            </div>

            {error && (
                <div className="error-message">
                    ⚠️ {error}
                </div>
            )}

            <div className="test-section">
                <h3>📋 현재 상태</h3>
                <div className="status-grid">
                    <div className="status-item">
                        <span className="status-label">알림 권한:</span>
                        <span className={`status-value ${permissionStatus.className}`}>
                            {permissionStatus.text}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">구독 상태:</span>
                        <span className={`status-value ${isSubscribed ? 'granted' : 'denied'}`}>
                            {isSubscribed ? '구독 중 ✅' : '미구독 ❌'}
                        </span>
                    </div>
                    <div className="status-item">
                        <span className="status-label">배지 카운트:</span>
                        <span className="status-value badge-count">{badgeCount}</span>
                    </div>
                </div>
            </div>

            <div className="test-section">
                <h3>🔔 푸시 알림 구독</h3>
                <div className="button-group">
                    {!isSubscribed ? (
                        <button
                            onClick={handleSubscribe}
                            disabled={loading}
                            className="btn btn-primary"
                        >
                            {loading ? '처리 중...' : '알림 구독하기'}
                        </button>
                    ) : (
                        <button
                            onClick={handleUnsubscribe}
                            disabled={loading}
                            className="btn btn-danger"
                        >
                            {loading ? '처리 중...' : '구독 해제하기'}
                        </button>
                    )}
                </div>
            </div>

            <div className="test-section">
                <h3>📨 테스트 알림 발송</h3>
                <p className="section-description">
                    실제 푸시 서버 없이 로컬에서 알림을 테스트합니다
                </p>
                {(!isSubscribed || permission !== 'granted') && (
                    <div className="error-message" style={{ marginBottom: '1rem' }}>
                        ⚠️ {!isSubscribed ? '먼저 "알림 구독하기" 버튼을 클릭해주세요!' : '알림 권한이 필요합니다!'}
                    </div>
                )}
                <div className="button-group">
                    <button
                        onClick={handleSendTestNotification}
                        disabled={!isSubscribed || permission !== 'granted'}
                        className="btn btn-success"
                    >
                        테스트 알림 보내기
                    </button>
                </div>
            </div>

            <div className="test-section">
                <h3>🔢 앱 배지 테스트</h3>
                <p className="section-description">
                    앱 아이콘에 표시되는 숫자 배지를 테스트합니다
                </p>
                <div className="button-group">
                    <button
                        onClick={handleIncreaseBadge}
                        className="btn btn-secondary"
                    >
                        배지 +1
                    </button>
                    <button
                        onClick={handleDecreaseBadge}
                        disabled={badgeCount === 0}
                        className="btn btn-secondary"
                    >
                        배지 -1
                    </button>
                    <button
                        onClick={handleClearBadge}
                        disabled={badgeCount === 0}
                        className="btn btn-outline"
                    >
                        배지 리셋
                    </button>
                </div>
            </div>

            <div className="test-section info-section">
                <h3>ℹ️ 사용 방법</h3>
                <ol className="info-list">
                    <li>먼저 <strong>"알림 구독하기"</strong> 버튼을 클릭하여 브라우저 권한을 승인하세요</li>
                    <li><strong>"테스트 알림 보내기"</strong>로 푸시 알림이 정상 작동하는지 확인하세요</li>
                    <li>배지 버튼들로 앱 아이콘의 숫자 표시를 테스트하세요</li>
                    <li>알림을 클릭하면 앱이 포커스됩니다</li>
                </ol>
                <div className="info-note">
                    <strong>💡 참고:</strong> 푸시 알림은 HTTPS 환경과 설치된 PWA에서만 작동합니다.
                    로컬 테스트는 localhost에서 가능합니다.
                </div>
            </div>
        </div>
    );
};
