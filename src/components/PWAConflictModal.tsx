import { useRef, useEffect } from "react";

interface PWAConflictModalProps {
    show: boolean;
    onClose: () => void;
}

export default function PWAConflictModal({ show, onClose }: PWAConflictModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (show) {
            // 모달이 뜰 때 10초 후 자동 닫힘 (선택 사항)
            // timerRef.current = setTimeout(() => {
            //   onClose();
            // }, 10000);
        } else {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [show, onClose]);

    if (!show) return null;

    const handleOpenApp = () => {
        // 앱으로 이동 시도 (홈 경로로 이동하면 Android가 앱으로 잡을 수 있음)
        // 또는 커스텀 스킴이 있다면 그것을 사용
        window.location.href = "/?mode=app_redirect";
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={onClose}
        >
            <div
                ref={modalRef}
                className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-scaleIn"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-900/30 mb-4">
                        <i className="ri-smartphone-line text-3xl text-blue-400"></i>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2">
                        앱에서 더 원활하게!
                    </h3>

                    <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                        현재 브라우저 환경에서 접속 불안정이 감지되었습니다.<br />
                        설치된 <strong>댄스빌보드 앱</strong>으로 이동하시겠습니까?
                    </p>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleOpenApp}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <span>앱으로 이동하기</span>
                            <i className="ri-arrow-right-line"></i>
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 font-medium rounded-lg transition-colors"
                        >
                            브라우저에서 계속하기
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
