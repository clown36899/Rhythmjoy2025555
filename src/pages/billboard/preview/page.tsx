import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import HomeV2 from '../../v2/Page';
import './preview.css'; // [New] 독립적인 스타일 import

const REF_WIDTH = 1200;
const REF_HEIGHT_MIN = 932;
const SCREEN_PADDING = 40;

export default function BillboardPreviewPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [needsRotation, setNeedsRotation] = useState(false);
    const [scale, setScale] = useState(1);
    const [measuredHeight, setMeasuredHeight] = useState(REF_HEIGHT_MIN);

    // Refs to track state to prevent infinite update loops
    const lastHeightRef = useRef(REF_HEIGHT_MIN);
    const lastScaleRef = useRef(1);

    // 5분 후 빌보드로 복귀
    useEffect(() => {
        console.log("Preview Timer Disabled for Customization");
    }, [navigate, userId]);

    // 화면 방향 및 스케일 계산 (Stable Scaling Logic)
    useLayoutEffect(() => {
        let debounceTimer: NodeJS.Timeout;

        const updateLayout = () => {
            if (!contentRef.current) return;

            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const isLandscape = windowWidth > windowHeight;

            setNeedsRotation(isLandscape);

            const effectiveViewportWidth = isLandscape ? windowHeight : windowWidth;
            const effectiveViewportHeight = isLandscape ? windowWidth : windowHeight;

            const availableWidth = Math.max(effectiveViewportWidth - (SCREEN_PADDING * 2), 100);
            const availableHeight = Math.max(effectiveViewportHeight - (SCREEN_PADDING * 2), 100);

            // [안정성 강화] 소수점 단위의 미세한 변화를 무시하기 위해 Math.round 사용
            const rawHeight = contentRef.current.scrollHeight;
            const contentHeight = Math.round(Math.max(rawHeight, REF_HEIGHT_MIN));

            const scaleW = availableWidth / REF_WIDTH;
            const scaleH = availableHeight / contentHeight;

            const fitScale = Math.min(scaleW, scaleH);
            const finalScale = Math.min(fitScale, 1);

            // [껌뻑거림 방지] 변화량이 매우 작으면 업데이트를 무시하여 정지시킴
            const heightChange = Math.abs(contentHeight - lastHeightRef.current);
            const scaleChange = Math.abs(finalScale - lastScaleRef.current);

            if (heightChange > 3 || scaleChange > 0.005) {
                lastHeightRef.current = contentHeight;
                lastScaleRef.current = finalScale;
                setMeasuredHeight(contentHeight);
                setScale(finalScale);
                console.log(`Scaler: Updated (H:${contentHeight}, S:${finalScale.toFixed(3)})`);
            } else {
                console.log("Scaler: Stabilized.");
            }
        };

        const debouncedResize = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateLayout, 150);
        };
        window.addEventListener('resize', debouncedResize);

        const resizeObserver = new ResizeObserver(() => {
            updateLayout();
        });

        if (contentRef.current) {
            resizeObserver.observe(contentRef.current);
        }

        updateLayout();

        /* [Safe Styles Override] */
        const rootElement = document.getElementById('root');
        const htmlElement = document.documentElement;

        let originalRootStyles: { [key: string]: string } = {};
        let originalBodyStyles: { [key: string]: string } = {};
        let originalHtmlStyles: { [key: string]: string } = {};

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
        htmlElement.style.backgroundColor = '#000000';

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
            rootElement.style.overflow = 'auto';
        }

        return () => {
            clearTimeout(debounceTimer);
            window.removeEventListener('resize', debouncedResize);
            resizeObserver.disconnect();

            htmlElement.style.maxWidth = originalHtmlStyles.maxWidth || '';
            htmlElement.style.margin = originalHtmlStyles.margin || '';
            htmlElement.style.width = originalHtmlStyles.width || '';
            htmlElement.style.overflowX = originalHtmlStyles.overflowX || '';
            htmlElement.style.backgroundColor = originalHtmlStyles.backgroundColor || '';

            document.body.style.maxWidth = originalBodyStyles.maxWidth || '';
            document.body.style.margin = originalBodyStyles.margin || '';
            document.body.style.width = originalBodyStyles.width || '';
            document.body.style.overflow = originalBodyStyles.overflow || '';
            document.body.style.backgroundColor = originalBodyStyles.backgroundColor || '';

            if (rootElement) {
                rootElement.style.maxWidth = originalRootStyles.maxWidth || '';
                rootElement.style.margin = originalRootStyles.margin || '';
                rootElement.style.width = originalRootStyles.width || '';
                rootElement.style.height = originalRootStyles.height || '';
                rootElement.style.overflow = originalRootStyles.overflow || '';
            }
        };
    }, []);

    const wrapperStyle: React.CSSProperties = needsRotation ? {
        position: "absolute",
        top: "50%",
        left: "50%",

        // 측정된 실제 크기를 기준값으로 사용 (Scale 적용 전 원래 크기)
        width: REF_WIDTH,
        height: measuredHeight,

        // 중앙에 배치하고 스케일 적용 (회전 포함)
        transform: `translate(-50%, -50%) rotate(90deg) scale(${scale})`,
        transformOrigin: "center center",
        backgroundColor: "black"
    } : {
        position: "absolute",
        top: "50%",
        left: "50%",

        width: REF_WIDTH,
        height: measuredHeight,

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
                <div
                    ref={contentRef}
                    className="billboard-preview-content"
                    style={{
                        width: REF_WIDTH, // [중요] 측정 기준 너비를 고정하여 무한 루프 방지
                        minHeight: '100%'
                    }}
                >
                    <div className="preview-content-wrapper">
                        <HomeV2 />
                    </div>
                </div>
            </div>
        </div>
    );
}
