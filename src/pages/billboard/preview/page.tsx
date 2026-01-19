import { useEffect, useState, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BillboardLayout from './BillboardLayout';
import './preview.css';

export default function BillboardPreviewPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const [needsRotation, setNeedsRotation] = useState(false);
    const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });

    // 5분 후 빌보드로 복귀 (유지)
    useEffect(() => {
        console.log("Preview Timer Disabled for Customization");
    }, [navigate, userId]);

    // 회전 및 크기 변화 감지 로직 유지
    useLayoutEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setViewportSize({ w, h });

            // 전광판은 보통 세로(Portrait)이나, PC 모니터는 가로(Landscape).
            // 가로 모니터에서 세로 전광판을 시뮬레이션하기 위해 가로가 더 넓으면 90도 회전을 적용하던 로직을 유지합니다.
            setNeedsRotation(w > h);
        };

        window.addEventListener('resize', updateLayout);
        updateLayout();

        const htmlElement = document.documentElement;
        htmlElement.style.backgroundColor = '#000000';
        htmlElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    /**
     * [Fully Responsive Fill]
     * needsRotation이 참이면 (가로 해상도 PC에서 보는 세로 전광판): 
     *    너비를 viewport 높이로, 높이를 viewport 너비로 설정하고 90도 회전하여 '꽉 채움'
     * needsRotation이 거짓이면 (이미 세로 모드인 전광판 기기):
     *    100vw, 100vh를 그대로 사용
     */
    const wrapperStyle: React.CSSProperties = needsRotation ? {
        position: "fixed",
        top: 0,
        left: 0,
        width: `${viewportSize.h}px`, // 회전 후 화면에 꽉 차도록 반전
        height: `${viewportSize.w}px`,
        transform: "rotate(90deg)",
        transformOrigin: "top left",
        left: `${viewportSize.w}px`, // 회전축 이동 보정
        backgroundColor: "black",
        overflow: "hidden"
    } : {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "black",
        overflow: "hidden"
    };

    return (
        <div className="billboard-preview-root-fully-responsive">
            <div className="billboard-preview-wrapper" style={wrapperStyle}>
                <BillboardLayout />
            </div>
        </div>
    );
}
