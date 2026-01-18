import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HomeV2 from '../../v2/Page';
import './preview.css'; // [New] 독립적인 스타일 import

export default function BillboardPreviewPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [needsRotation, setNeedsRotation] = useState(false); // [Billboard Logic]
    const [scale, setScale] = useState(1);

    // Reference Resolution fallback (iPhone 15 Pro Max approx)
    const REF_WIDTH = 430;
    const REF_HEIGHT_MIN = 932; // Minimum height to support

    // 5분 후 빌보드로 복귀 (테스트 모드일 경우 10초)
    useEffect(() => {
        // [Customization Mode] UI 수정을 위해 타이머 일시 비활성화
        console.log("Preview Timer Disabled for Customization");
    }, [navigate, userId]);

    // 화면 방향 및 스케일 계산 (Dynamic Height Scaling)
    useLayoutEffect(() => {
        let debounceTimer: NodeJS.Timeout;

        const updateLayout = () => {
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const isLandscape = windowWidth > windowHeight;

            setNeedsRotation(isLandscape);

            // 현재 뷰포트의 유효 크기 (회전 시 높이/너비 Swap)
            const effectiveViewportWidth = isLandscape ? windowHeight : windowWidth;
            const effectiveViewportHeight = isLandscape ? windowWidth : windowHeight;

            // 컨텐츠의 실제 높이 측정 (없으면 기본값)
            // scrollHeight를 사용하여 잘린 부분 없이 전체 높이를 인식
            let contentHeight = contentRef.current?.scrollHeight || REF_HEIGHT_MIN;
            // 혹시 컨텐츠가 너무 작으면 최소 높이 보장
            if (contentHeight < REF_HEIGHT_MIN) contentHeight = REF_HEIGHT_MIN;

            // "위아래 잘리지 않게": 컨텐츠 전체 높이 기준 스케일 계산
            const scaleW = effectiveViewportWidth / REF_WIDTH;
            const scaleH = effectiveViewportHeight / contentHeight;

            // 둘 중 더 작은 비율 선택 (Contain)
            // 가로가 좁으면 가로에 맞추고, 세로가 길면 세로에 맞춰서 전체가 보이게 함
            const fitScale = Math.min(scaleW, scaleH);

            // 1(100%)보다 작을 때만 적용 (확대 금지)
            const finalScale = Math.min(fitScale, 1);

            setScale(finalScale);
        };

        // 1. Window Resize Listener
        const debouncedResize = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateLayout, 100);
        };
        window.addEventListener('resize', debouncedResize);

        // 2. Content Resize Listener (컨텐츠 내용 변경/로딩 대응)
        const resizeObserver = new ResizeObserver(() => {
            updateLayout();
        });
        if (contentRef.current) {
            resizeObserver.observe(contentRef.current);
        }

        // 초기 실행
        updateLayout();

        /* [Safe Styles Override - Keep Existing] */
        // [Crucial Fix] #root, Body, HTML 스타일 완전 해제 (Safe Isolation via JS)
        // index.css의 html, body { max-width: 650px } 제한을 무력화해야 함.
        const rootElement = document.getElementById('root');
        const htmlElement = document.documentElement;

        // Backups
        let originalRootStyles: { [key: string]: string } = {};
        let originalBodyStyles: { [key: string]: string } = {};
        let originalHtmlStyles: { [key: string]: string } = {};

        // 1. HTML Override
        originalHtmlStyles = {
            maxWidth: htmlElement.style.maxWidth,
            margin: htmlElement.style.margin,
            width: htmlElement.style.width,
            overflowX: htmlElement.style.overflowX,
            backgroundColor: htmlElement.style.backgroundColor
        };
        htmlElement.style.maxWidth = 'none';
        htmlElement.style.margin = '0';
        htmlElement.style.width = '100%';
        htmlElement.style.overflowX = 'hidden';
        htmlElement.style.backgroundColor = '#000000'; // TV Background

        // 2. Body Override
        originalBodyStyles = {
            maxWidth: document.body.style.maxWidth,
            margin: document.body.style.margin,
            width: document.body.style.width,
            overflow: document.body.style.overflow,
            backgroundColor: document.body.style.backgroundColor
        };
        document.body.style.maxWidth = 'none';
        document.body.style.margin = '0';
        document.body.style.width = '100%';
        document.body.style.backgroundColor = '#000000';
        // document.body.style.overflow = 'hidden'; 

        // 3. Root Override
        if (rootElement) {
            originalRootStyles = {
                maxWidth: rootElement.style.maxWidth,
                margin: rootElement.style.margin,
                width: rootElement.style.width,
                height: rootElement.style.height,
                overflow: rootElement.style.overflow
            };

            rootElement.style.maxWidth = 'none';
            rootElement.style.margin = '0';
            rootElement.style.width = '100%';
            rootElement.style.height = '100%';
            rootElement.style.overflow = 'auto'; // Allow internal scroll logic if needed, but wrapper controls it

            console.log("Preview Mode: All styles overridden.");
        }

        return () => {
            clearTimeout(debounceTimer);
            window.removeEventListener('resize', debouncedResize);
            resizeObserver.disconnect();

            // Restore HTML
            htmlElement.style.maxWidth = originalHtmlStyles.maxWidth || '';
            htmlElement.style.margin = originalHtmlStyles.margin || '';
            htmlElement.style.width = originalHtmlStyles.width || '';
            htmlElement.style.overflowX = originalHtmlStyles.overflowX || '';
            htmlElement.style.backgroundColor = originalHtmlStyles.backgroundColor || '';

            // Restore Body
            document.body.style.maxWidth = originalBodyStyles.maxWidth || '';
            document.body.style.margin = originalBodyStyles.margin || '';
            document.body.style.width = originalBodyStyles.width || '';
            document.body.style.overflow = originalBodyStyles.overflow || '';
            document.body.style.backgroundColor = originalBodyStyles.backgroundColor || '';

            // Restore Root
            if (rootElement) {
                rootElement.style.maxWidth = originalRootStyles.maxWidth || '';
                rootElement.style.margin = originalRootStyles.margin || '';
                rootElement.style.width = originalRootStyles.width || '';
                rootElement.style.height = originalRootStyles.height || '';
                rootElement.style.overflow = originalRootStyles.overflow || '';
                console.log("Preview Mode: Styles restored.");
            }
        };
    }, []);

    /* [Billboard Logic & User Request] 
       1. Scale < 1 (Small Screen): Scale Down content (Inverse-Expand Container).
       2. Scale = 1 (Large Screen): 100% Fluid.
       3. "꽉 차게": Use 100% / scale dimensions to fill viewport perfectly without black bars type letterboxing.
    */

    const wrapperStyle: React.CSSProperties = needsRotation ? {
        // [Rotation Case] Rotate 90deg and Center
        position: "absolute",
        top: "50%",
        left: "50%",

        // Inverse Scale Dimensions to ensure it visually fills 100vh/100vw after scaling down
        width: `calc(100vh / ${scale})`,
        height: `calc(100vw / ${scale})`,

        transform: `translate(-50%, -50%) rotate(90deg) scale(${scale})`,
        transformOrigin: "center center",
        backgroundColor: "black"
    } : {
        // [Default / Portrait Case]
        position: "absolute",
        top: "50%",
        left: "50%",

        // Inverse Scale Dimensions
        width: `calc(100% / ${scale})`,
        height: `calc(100% / ${scale})`,

        // Always center for consistency
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center center",

        backgroundColor: "black"
    };

    return (
        <div className="billboard-preview-root">
            <div
                ref={containerRef}
                className="billboard-preview-mode billboard-preview-wrapper"
                style={wrapperStyle}
            >
                <div ref={contentRef} className="billboard-preview-content">
                    <div className="preview-content-wrapper">
                        <HomeV2 />
                    </div>
                </div>
            </div>
        </div>
    );
}
