import { useState } from 'react';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
import { getMobilePlatform, isPWAMode } from '../lib/pwaDetect';
import { PWAInstallGuideModal } from './PWAInstallGuideModal';
import './PWAInstallButton.css';

type PWAInstallButtonVariant = 'compact' | 'dashboard';

interface PWAInstallButtonProps {
    variant?: PWAInstallButtonVariant;
    className?: string;
    onActionComplete?: () => void;
}

export function PWAInstallButton({
    variant = 'compact',
    className = '',
    onActionComplete,
}: PWAInstallButtonProps) {
    const { promptEvent, setPromptEvent, isInstalled } = useInstallPrompt();
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isPrompting, setIsPrompting] = useState(false);

    const platform = getMobilePlatform();
    const installed = isInstalled || isPWAMode();
    const canUseNativePrompt = Boolean(promptEvent && !installed && platform !== 'ios');
    const statusLabel = installed ? 'ON' : canUseNativePrompt ? '설치' : '안내';
    const iconClass = installed
        ? 'ri-checkbox-circle-line'
        : canUseNativePrompt
            ? 'ri-download-cloud-2-line'
            : 'ri-add-circle-line';
    const ariaLabel = installed
        ? '앱 설치 상태 보기'
        : canUseNativePrompt
            ? '앱 설치하기'
            : '앱 설치 안내 보기';

    const openGuide = () => {
        setIsGuideOpen(true);
        onActionComplete?.();
    };

    const handleClick = async () => {
        if (installed || !canUseNativePrompt || !promptEvent) {
            openGuide();
            return;
        }

        try {
            setIsPrompting(true);
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            setPromptEvent(null);
            (window as any).deferredPrompt = null;

            if (choice.outcome !== 'accepted') {
                openGuide();
            } else {
                onActionComplete?.();
            }
        } catch (error) {
            console.warn('[PWAInstallButton] Native install prompt failed:', error);
            openGuide();
        } finally {
            setIsPrompting(false);
        }
    };

    const buttonClassName = [
        'PWAInstallButton',
        `PWAInstallButton--${variant}`,
        variant === 'dashboard' ? 'SD-menuItem SD-pwaGuideEntry' : '',
        installed ? 'is-installed' : '',
        canUseNativePrompt ? 'has-native-prompt' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <>
            <button
                type="button"
                className={buttonClassName}
                onClick={handleClick}
                disabled={isPrompting}
                aria-label={ariaLabel}
                title={ariaLabel}
                data-analytics-id="pwa_install"
                data-analytics-type="action"
                data-analytics-title={ariaLabel}
                data-analytics-section={variant === 'dashboard' ? 'side_drawer' : 'today_social'}
            >
                <i className={isPrompting ? 'ri-loader-4-line PWAInstallButton-spin' : iconClass}></i>
                {variant === 'dashboard' ? (
                    <div className="SD-menuLabelWithStatus">
                        <span>{installed ? '앱 실행 중' : '앱 설치'}</span>
                        <span className={`SD-statusDot ${installed || canUseNativePrompt ? 'is-active' : ''}`}>
                            {statusLabel}
                        </span>
                    </div>
                ) : (
                    <span className="PWAInstallButton-compactLabel">앱 설치</span>
                )}
            </button>

            <PWAInstallGuideModal
                isOpen={isGuideOpen}
                onClose={() => setIsGuideOpen(false)}
            />
        </>
    );
}
