import { useRef, useEffect } from "react";
import "./PWAConflictModal.css";

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


    return (
        <div className="pwa-conflict-overlay">
            <div
                ref={modalRef}
                className="pwa-conflict-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="pwa-conflict-content">
                    <div className="pwa-conflict-icon">
                        <i className="ri-smartphone-line"></i>
                    </div>



                    <p className="pwa-conflict-description">
                        <strong>백그라운드에 댄스빌보드 앱이 실행 중입니다.</strong><br />
                        브라우저와 앱 중 하나를 종료해야 정상 작동합니다.<br />
                        하나를 종료하고 계속 이용해 주세요.
                    </p>

                    <div className="pwa-conflict-buttons">
                        <button
                            onClick={onClose}
                            className="pwa-conflict-btn pwa-conflict-btn-primary"
                        >
                            <span>확인</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
