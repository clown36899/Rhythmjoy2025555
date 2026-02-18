import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

/**
 * Mobile Debug Overlay
 * 아이폰/모바일 환경에서 콘솔 로그를 볼 수 없을 때 화면 상단에 띄워 디버깅 정보를 제공합니다.
 * 개발자 도구(F12)가 없는 환경에서 필수적입니다.
 */
const DebugOverlay = () => {
    const { user, loading, session } = useAuth();
    const location = useLocation();

    // 상태 추적
    const [logs, setLogs] = useState<{ time: string, msg: string }[]>([]);
    const [renderCount, setRenderCount] = useState(0);
    const [expanded, setExpanded] = useState(false);

    // 1초마다 갱신 (너무 잦은 리렌더링 방지)
    useEffect(() => {
        const timer = setInterval(() => {
            setRenderCount(c => c + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // 전역 콘솔 인터셉트 (간단한 버전)
    // 주의: 실제 프로덕션 코드에 영향을 최소화하기 위해 읽기만 수행
    // 여기서는 인터셉트보다는 주요 컴포넌트에서 window.logDebug() 등을 호출하는 방식을 권장하지만,
    // 긴급 디버깅을 위해 console.log를 래핑하지 않고 별도 함수를 노출합니다.

    useEffect(() => {
        (window as any).logDebug = (msg: string) => {
            const time = new Date().toLocaleTimeString();
            setLogs(prev => [{ time, msg }, ...prev].slice(0, 20)); // 최근 20개만 유지
        };

        return () => {
            delete (window as any).logDebug;
        };
    }, []);

    if (!expanded) {
        return (
            <div
                onClick={() => setExpanded(true)}
                style={{
                    position: 'fixed',
                    top: '0',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(255, 0, 0, 0.7)',
                    color: 'white',
                    padding: '4px 8px',
                    fontSize: '10px',
                    zIndex: 99999,
                    borderRadius: '0 0 8px 8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    pointerEvents: 'auto'
                }}
            >
                DEBUG MODE (Click to Expand)
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '40vh', // 화면의 40% 차지
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '10px',
            zIndex: 99999,
            overflowY: 'auto',
            padding: '10px',
            boxSizing: 'border-box',
            borderBottom: '2px solid #0f0',
            pointerEvents: 'auto'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                <strong style={{ color: '#fff' }}>🛠️ SYSTEM STATUS</strong>
                <button onClick={() => setExpanded(false)} style={{ background: '#333', color: '#fff', border: 'none', padding: '2px 8px' }}>CLOSE</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '10px' }}>
                <div>URL: <span style={{ color: '#fff' }}>{location.pathname}</span></div>
                <div>Render: <span style={{ color: '#fff' }}>{renderCount}s</span></div>
                <div>Auth Loading: <span style={{ color: loading ? 'red' : '#0f0' }}>{loading ? 'YES' : 'NO'}</span></div>
                <div>User: <span style={{ color: user ? '#0f0' : 'red' }}>{user ? 'LOGGED IN' : 'GUEST'}</span></div>
                <div>Session: <span style={{ color: session ? '#0f0' : 'yellow' }}>{session ? 'ACTIVE' : 'NONE'}</span></div>
                <div>UA: <span style={{ color: '#aaa', fontSize: '8px' }}>{navigator.userAgent.slice(0, 30)}...</span></div>
            </div>

            <div style={{ borderTop: '1px solid #333', paddingTop: '4px' }}>
                <strong style={{ color: '#fff' }}>📝 REALTIME LOGS</strong>
                {logs.length === 0 && <div style={{ color: '#666' }}>Waiting for logs...</div>}
                {logs.map((log, i) => (
                    <div key={i} style={{ marginTop: '2px', borderBottom: '1px solid #111' }}>
                        <span style={{ color: '#888', marginRight: '4px' }}>[{log.time}]</span>
                        {log.msg}
                    </div>
                ))}
            </div>

            <button
                onClick={() => setLogs([])}
                style={{
                    position: 'absolute',
                    top: '10px',
                    right: '80px',
                    background: '#333',
                    color: '#fff',
                    border: 'none',
                    padding: '2px 8px',
                    fontSize: '10px'
                }}
            >
                CLEAR
            </button>
        </div>
    );
};

export default DebugOverlay;
