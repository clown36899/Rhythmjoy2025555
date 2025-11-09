import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';

export default function BillboardOverlayPage() {
  const { userId } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  
  // URL 파라미터에서 데이터 읽기
  const title = searchParams.get('title') || '';
  const date = searchParams.get('date') || '';
  const location = searchParams.get('location') || '';
  const qrUrl = searchParams.get('qrUrl') || `${window.location.origin}/billboard/${userId}`;
  
  // 화면 크기에 따른 스케일 계산
  const [scale, setScale] = useState(1);
  const [dateLocationHeight, setDateLocationHeight] = useState(0);
  const [bottomInfoHeight, setBottomInfoHeight] = useState(0);
  const [dateLocationFontSize, setDateLocationFontSize] = useState(0);
  const [titleFontSize, setTitleFontSize] = useState(0);
  const [qrSize, setQrSize] = useState(0);

  useEffect(() => {
    const calculateSizes = () => {
      const screenHeight = window.innerHeight;
      const screenWidth = window.innerWidth;
      const baseWidth = 1920;
      const baseHeight = 1080;
      
      // 화면 비율에 따른 스케일 계산
      const widthScale = screenWidth / baseWidth;
      const heightScale = screenHeight / baseHeight;
      const currentScale = Math.min(widthScale, heightScale);
      setScale(currentScale);
      
      // 하단 정보 영역 높이 계산 (화면 높이의 18%)
      const totalInfoHeight = screenHeight * 0.18;
      const dateLocationH = totalInfoHeight * 0.44; // 8%
      const bottomInfoH = totalInfoHeight * 0.56; // 10%
      
      setDateLocationHeight(dateLocationH);
      setBottomInfoHeight(bottomInfoH);
      
      // 폰트 크기 계산
      setDateLocationFontSize(dateLocationH * 0.32);
      setTitleFontSize(bottomInfoH * 0.42);
      setQrSize(bottomInfoH * 0.95);
    };
    
    calculateSizes();
    window.addEventListener('resize', calculateSizes);
    window.addEventListener('orientationchange', calculateSizes);
    
    return () => {
      window.removeEventListener('resize', calculateSizes);
      window.removeEventListener('orientationchange', calculateSizes);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes float1 { 0% { opacity: 0; transform: scale(0) translateY(-50px); } 30% { opacity: 0.8; transform: scale(1.3) translateY(5px); } 60% { opacity: 0.6; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.8) translateY(10px); } }
        @keyframes float2 { 0% { opacity: 0; transform: scale(0) translateY(-80px); } 30% { opacity: 0.7; transform: scale(1.4) translateY(8px); } 60% { opacity: 0.5; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.7) translateY(15px); } }
        @keyframes diamond { 0% { opacity: 0; transform: rotate(45deg) scale(0); } 30% { opacity: 0.7; transform: rotate(225deg) scale(1.3); } 60% { opacity: 0.5; transform: rotate(405deg) scale(1); } 100% { opacity: 0; transform: rotate(495deg) scale(0.6); } }
        @keyframes diamond2 { 0% { opacity: 0; transform: rotate(45deg) scale(0); } 30% { opacity: 0.6; transform: rotate(-135deg) scale(1.4); } 60% { opacity: 0.4; transform: rotate(-315deg) scale(1); } 100% { opacity: 0; transform: rotate(-405deg) scale(0.5); } }
        @keyframes particle1 { 0% { opacity: 0; transform: translateX(-100px) translateY(-50px) scale(0); } 30% { opacity: 0.9; transform: translateX(50px) translateY(25px) scale(1.5); } 60% { opacity: 0.6; transform: translateX(0) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(30px) translateY(-20px) scale(0.5); } }
        @keyframes particle2 { 0% { opacity: 0; transform: translateX(100px) translateY(-50px) scale(0); } 30% { opacity: 0.8; transform: translateX(-50px) translateY(25px) scale(1.6); } 60% { opacity: 0.5; transform: translateX(0) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-30px) translateY(-20px) scale(0.4); } }
        @keyframes particle3 { 0% { opacity: 0; transform: translateY(-80px) scale(0); } 30% { opacity: 0.7; transform: translateY(20px) scale(1.4); } 60% { opacity: 0.4; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-15px) scale(0.6); } }
        @keyframes drawLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes slideInLeft { 0% { opacity: 0; transform: translateX(-150px) rotate(-8deg); } 100% { opacity: 1; transform: translateX(0) rotate(0deg); } }
        @keyframes slideInRight { 0% { opacity: 0; transform: translateX(150px) rotate(8deg); } 100% { opacity: 1; transform: translateX(0) rotate(0deg); } }
        @keyframes zoomInUp { 0% { opacity: 0; transform: scale(0.2) translateY(100px) rotate(-15deg); } 60% { opacity: 1; transform: scale(1.2) translateY(-15px) rotate(5deg); } 80% { opacity: 1; transform: scale(0.9) translateY(5px) rotate(-3deg); } 100% { opacity: 1; transform: scale(1) translateY(0) rotate(0deg); } }
        
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
      `}</style>
      
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'transparent',
        }}
      >
        {/* 하단 정보 레이어 */}
        <div
          id="billboard-info-layer"
          className="absolute bottom-0 left-0 right-0"
          style={{
            paddingLeft: `${32 * scale}px`,
            paddingRight: `${32 * scale}px`,
            paddingTop: `${40 * scale}px`,
            paddingBottom: `${40 * scale}px`,
            zIndex: 10,
            background: 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)',
          }}
        >
          {/* 장식 요소들 */}
          <div
            style={{
              position: 'absolute',
              top: `${-80 * scale}px`,
              left: `${20 * scale}px`,
              width: `${60 * scale}px`,
              height: `${60 * scale}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0))',
              animation: `float1 2.5s ease-in-out 0s forwards`,
              opacity: 0,
              transform: `scale(0) translateY(-${50 * scale}px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${-60 * scale}px`,
              right: `${40 * scale}px`,
              width: `${80 * scale}px`,
              height: `${80 * scale}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0))',
              animation: `float2 2.6s ease-in-out 0.3s forwards`,
              opacity: 0,
              transform: `scale(0) translateY(-${80 * scale}px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${-90 * scale}px`,
              left: `${120 * scale}px`,
              width: `${40 * scale}px`,
              height: `${40 * scale}px`,
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              transform: 'rotate(45deg)',
              animation: `diamond 2.8s ease-in-out 0.6s forwards`,
              opacity: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${-70 * scale}px`,
              right: `${150 * scale}px`,
              width: `${50 * scale}px`,
              height: `${50 * scale}px`,
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              transform: 'rotate(45deg)',
              animation: `diamond2 2.7s ease-in-out 0.9s forwards`,
              opacity: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${10 * scale}px`,
              left: `${-30 * scale}px`,
              width: `${12 * scale}px`,
              height: `${12 * scale}px`,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              boxShadow: `0 0 ${20 * scale}px rgba(255, 255, 255, 0.6)`,
              animation: `particle1 3s ease-in-out 1.2s forwards`,
              opacity: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${40 * scale}px`,
              right: `${-20 * scale}px`,
              width: `${14 * scale}px`,
              height: `${14 * scale}px`,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              boxShadow: `0 0 ${25 * scale}px rgba(255, 255, 255, 0.5)`,
              animation: `particle2 2.9s ease-in-out 1.5s forwards`,
              opacity: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: `${-50 * scale}px`,
              left: `${250 * scale}px`,
              width: `${10 * scale}px`,
              height: `${10 * scale}px`,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              boxShadow: `0 0 ${18 * scale}px rgba(255, 255, 255, 0.5)`,
              animation: `particle3 2.8s ease-in-out 1.8s forwards`,
              opacity: 0,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${48 * scale}px`,
              right: `${48 * scale}px`,
              height: `${2 * scale}px`,
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              transformOrigin: 'left',
              animation: `drawLine 1.2s ease-out 4.2s forwards`,
              transform: 'scaleX(0)',
            }}
          />

          {/* 날짜 + 장소 (8% 제한) */}
          <div
            style={{
              minHeight: `${dateLocationHeight}px`,
              marginBottom: `${dateLocationHeight * 0.1}px`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: `${dateLocationHeight * 0.05}px`,
            }}
          >
            {date && (
              <div
                className="text-blue-400 font-semibold"
                style={{
                  fontSize: `${dateLocationFontSize}px`,
                  lineHeight: 1.2,
                  animation: `slideInLeft 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards`,
                  opacity: 0,
                  transform: `translateX(-${dateLocationFontSize * 5}px) rotate(-8deg)`,
                }}
              >
                <i className="ri-calendar-line" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                {date}
              </div>
            )}
            {location && location.trim() && location !== '미정' && (
              <div
                className="text-gray-300"
                style={{
                  fontSize: `${dateLocationFontSize}px`,
                  lineHeight: 1.2,
                  animation: `slideInRight 1s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s forwards`,
                  opacity: 0,
                  transform: `translateX(${dateLocationFontSize * 5}px) rotate(8deg)`,
                }}
              >
                <i className="ri-map-pin-line" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                {location}
              </div>
            )}
          </div>

          {/* 제목 + QR (10% 제한 영역) */}
          <div 
            className="flex items-center justify-between"
            style={{
              minHeight: `${bottomInfoHeight}px`,
            }}
          >
            <h3
              className="text-white font-bold flex-1"
              style={{
                fontSize: `${titleFontSize}px`,
                lineHeight: 1.2,
                wordBreak: 'keep-all',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                paddingRight: `${qrSize * 0.1}px`,
                animation: `zoomInUp 1.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards`,
                opacity: 0,
                transform: `scale(0.2) translateY(${titleFontSize * 2}px) rotate(-15deg)`,
              }}
            >
              {title}
            </h3>
            <div
              className="bg-white rounded-lg flex-shrink-0"
              style={{
                padding: `${qrSize * 0.08}px`,
                marginLeft: `${qrSize * 0.1}px`,
              }}
            >
              <QRCodeCanvas
                value={qrUrl}
                size={Math.round(qrSize)}
                level="M"
                includeMargin={false}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
