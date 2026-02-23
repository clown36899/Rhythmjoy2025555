import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './DebugLogPage.css';

export default function DebugLogPage() {
    const navigate = useNavigate();
    const [logs, setLogs] = useState<string[]>([]);
    const [swStatus, setSwStatus] = useState<any[]>([]);
    const [cacheKeys, setCacheKeys] = useState<string[]>([]);
    const [authState, setAuthState] = useState<any>(null);

    useEffect(() => {
        refreshInfo();
    }, []);

    const refreshInfo = async () => {
        // 1. LocalStorage Logs
        const storedLogs = JSON.parse(localStorage.getItem('logout_debug_logs') || '[]');
        setLogs(storedLogs);

        // 2. Auth State
        const { data: { session } } = await supabase.auth.getSession();
        setAuthState({
            hasSession: !!session,
            email: session?.user?.email,
            isLoggingOut: localStorage.getItem('isLoggingOut')
        });

        // 3. Service Worker Status
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            const statusList = registrations.map(reg => ({
                scope: reg.scope,
                active: reg.active ? 'Active' : 'No',
                waiting: reg.waiting ? 'Waiting' : 'No',
                installing: reg.installing ? 'Installing' : 'No',
            }));
            setSwStatus(statusList);
        }

        // 4. Cache Keys
        if ('caches' in window) {
            const keys = await caches.keys();
            setCacheKeys(keys);
        }
    };

    const handleForceLogout = async () => {
        if (!confirm('강제 로그아웃 및 PWA 초기화를 진행하시겠습니까?')) return;

        try {
            // 1. SW Unregister
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.unregister();
                }
            }

            // 2. Cache Clear
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            }

            // 3. Storage Clear
            localStorage.clear();
            sessionStorage.clear();

            // 4. Supabase SignOut
            await supabase.auth.signOut();

            alert('초기화 완료. 메인으로 이동합니다.');
            window.location.href = '/';
        } catch (err: any) {
            alert('에러 발생: ' + err.message);
        }
    };

    return (
        <div className="debug-page-container">
            <h1 className="debug-title">🕵️‍♂️ PWA Debugger</h1>

            <div className="debug-action-bar">
                <button onClick={refreshInfo} className="debug-btn">
                    새로고침
                </button>
                <button onClick={() => navigate('/')} className="debug-btn">
                    메인으로
                </button>
                <button onClick={handleForceLogout} className="debug-btn debug-btn-danger">
                    🔥 PWA 완전 초기화
                </button>
            </div>

            <section className="debug-section">
                <h2 className="debug-section-title">Service Workers ({swStatus.length})</h2>
                {swStatus.length === 0 ? <p className="debug-empty-text">No active service workers</p> : (
                    <ul className="debug-list">
                        {swStatus.map((sw, i) => (
                            <li key={i} className="debug-list-item">
                                Scope: {sw.scope}<br />
                                Status: {sw.active !== 'No' ? '✅ Active' : sw.waiting !== 'No' ? '⏳ Waiting' : '🔧 Installing'}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="debug-section">
                <h2 className="debug-section-title">Caches ({cacheKeys.length})</h2>
                {cacheKeys.length === 0 ? <p className="debug-empty-text">No caches found</p> : (
                    <ul className="debug-list">
                        {cacheKeys.map((key, i) => (
                            <li key={i}>{key}</li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="debug-section">
                <h2 className="debug-section-title">Auth State</h2>
                <pre className="debug-pre">
                    {JSON.stringify(authState, null, 2)}
                </pre>
            </section>

            <section className="debug-section">
                <h2 className="debug-section-title">Logout Logs</h2>
                <div className="debug-log-list">
                    {logs.length === 0 ? <p className="debug-empty-text">No logs recorded</p> : (
                        logs.slice().reverse().map((log, i) => ( // 최신순
                            <div key={i} className="debug-log-item">
                                {log}
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
