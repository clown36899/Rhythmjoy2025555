import React, { createContext, useContext, useEffect, useState } from 'react';
import { trackPWAInstall } from '../utils/analyticsEngine';
import { isPWAMode } from '../lib/pwaDetect';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptContextType {
    promptEvent: BeforeInstallPromptEvent | null;
    setPromptEvent: React.Dispatch<React.SetStateAction<BeforeInstallPromptEvent | null>>;
    isInstalled: boolean;
}

const InstallPromptContext = createContext<InstallPromptContextType | undefined>(undefined);
const INSTALL_PROMPT_DEBUG = import.meta.env.VITE_INSTALL_PROMPT_DEBUG === 'true';

export const InstallPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // console.log('🔍 [InstallPromptProvider] Initializing...');

        // 1. 초기 로드 시 감지 로직
        const checkInitialState = async () => {
            // PWA 모드로 진입한 경우
            if (isPWAMode()) {
                setIsInstalled(true);
                return;
            }

            // [MDN 가이드 반영] 브라우저에서 이미 설치된 앱이 있는지 확인
            if ('getInstalledRelatedApps' in navigator) {
                try {
                    const relatedApps = await (navigator as any).getInstalledRelatedApps();
                    // 설치된 관련 앱이 하나라도 있다면 설치된 것으로 간주
                    if (relatedApps && relatedApps.length > 0) {
                        if (INSTALL_PROMPT_DEBUG) {
                            console.debug('[InstallPromptProvider] Installed PWA detected via getInstalledRelatedApps');
                        }
                        setIsInstalled(true);
                        return;
                    }
                } catch (err) {
                    console.error('❌ Failed to get installed related apps:', err);
                }
            }

            // [Recovery] index.html에서 조기 캡처한 프롬프트가 있다면 가져옴
            if ((window as any).deferredPrompt) {
                setIsInstalled(false);
                setPromptEvent((window as any).deferredPrompt);
                return;
            }

            setIsInstalled(false);
        };

        checkInitialState();

        // 2. beforeinstallprompt 이벤트 리스너 (브라우저가 "설치 가능함"을 알릴 때)
        // 이 이벤트가 발생한다는 것은 => "현재 기기에 앱이 설치되어 있지 않음"을 의미합니다.
        const handler = (e: Event) => {
            // console.log('🎉 [InstallPromptProvider] beforeinstallprompt event captured!');
            e.preventDefault();

            // 설치 안 된 상태로 강제 전환
            setIsInstalled(false);

            // [Cleanup] 기기에 설치되지 않았음이 확실해지면 확증 플래그 청소
            // 모든 유저의 기록을 지우기 위해 pwa_verified_user_ 접두사 키 탐색
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('pwa_verified_user_')) {
                    localStorage.removeItem(key);
                }
            });

            setPromptEvent(e as BeforeInstallPromptEvent);
            (window as any).deferredPrompt = e;
        };

        // index.html에서 보낸 커스텀 이벤트 처리
        // index.html에서 보낸 커스텀 이벤트 처리
        const handleCustomPrompt = (e: any) => {
            // console.log('🛰️ [InstallPromptProvider] Custom pwaPromptReady event received');
            if (e.detail) {
                setPromptEvent(e.detail);
            }
        };

        // PWA 설치 완료 감지
        // PWA 설치 완료 감지
        const handleAppInstalled = async () => {
            // console.log('✅ [InstallPromptProvider] App installed!');
            setIsInstalled(true);
            setPromptEvent(null);
            // localStorage에 설치 기록
            localStorage.setItem('pwa_installed', 'true');

            // DB에 설치 이벤트 기록 (trackPWAInstall 내부에서 최신 세션 확인)
            try {
                await trackPWAInstall();
            } catch (error) {
                console.error('[InstallPromptProvider] Failed to track PWA install:', error);
            }
        };

        // console.log('👂 [InstallPromptProvider] Registering global event listeners...');
        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('pwaPromptReady' as any, handleCustomPrompt);

        return () => {
            // console.log('🔻 [InstallPromptProvider] Cleaning up event listeners');
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('pwaPromptReady' as any, handleCustomPrompt);
        };
    }, []);

    return (
        <InstallPromptContext.Provider value={{ promptEvent, setPromptEvent, isInstalled }}>
            {children}
        </InstallPromptContext.Provider>
    );
};

export const useInstallPrompt = () => {
    const context = useContext(InstallPromptContext);
    if (!context) {
        throw new Error('useInstallPrompt must be used within InstallPromptProvider');
    }
    return context;
};
