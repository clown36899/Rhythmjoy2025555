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
                        <strong>댄스빌보드 앱과 모바일 브라우저는 중복 실행 시 충돌 가능성이 있습니다.</strong><br />
                        둘 중 하나를 종료하고 사용하셔야 합니다.
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
