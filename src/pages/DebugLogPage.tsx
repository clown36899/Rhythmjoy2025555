import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
        } catch (e: any) {
            alert('에러 발생: ' + e.message);
        }
    };

    return (
        <div style={{ padding: '20px', background: '#111', color: '#fff', minHeight: '100vh', fontFamily: 'monospace' }}>
            <h1 style={{ fontSize: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>🕵️‍♂️ PWA Debugger</h1>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button onClick={refreshInfo} style={{ padding: '8px 12px', background: '#444', color: 'white', border: 'none', borderRadius: '4px' }}>
                    새로고침
                </button>
                <button onClick={() => navigate('/')} style={{ padding: '8px 12px', background: '#444', color: 'white', border: 'none', borderRadius: '4px' }}>
                    메인으로
                </button>
                <button onClick={handleForceLogout} style={{ padding: '8px 12px', background: '#bd2424', color: 'white', border: 'none', borderRadius: '4px' }}>
                    🔥 PWA 완전 초기화
                </button>
            </div>

            <section style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '16px', color: '#888' }}>Service Workers ({swStatus.length})</h2>
                {swStatus.length === 0 ? <p style={{ color: '#666' }}>No active service workers</p> : (
                    <ul style={{ background: '#222', padding: '10px', borderRadius: '5px' }}>
                        {swStatus.map((sw, i) => (
                            <li key={i} style={{ marginBottom: '5px' }}>
                                Scope: {sw.scope}<br />
                                Status: {sw.active !== 'No' ? '✅ Active' : sw.waiting !== 'No' ? '⏳ Waiting' : '🔧 Installing'}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '16px', color: '#888' }}>Caches ({cacheKeys.length})</h2>
                {cacheKeys.length === 0 ? <p style={{ color: '#666' }}>No caches found</p> : (
                    <ul style={{ background: '#222', padding: '10px', borderRadius: '5px' }}>
                        {cacheKeys.map((key, i) => (
                            <li key={i}>{key}</li>
                        ))}
                    </ul>
                )}
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '16px', color: '#888' }}>Auth State</h2>
                <pre style={{ background: '#222', padding: '10px', borderRadius: '5px', overflowX: 'auto' }}>
                    {JSON.stringify(authState, null, 2)}
                </pre>
            </section>

            <section>
                <h2 style={{ fontSize: '16px', color: '#888' }}>Logout Logs</h2>
                <div style={{ background: '#222', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                    {logs.length === 0 ? <p style={{ color: '#666' }}>No logs recorded</p> : (
                        logs.slice().reverse().map((log, i) => ( // 최신순
                            <div key={i} style={{ borderBottom: '1px solid #333', padding: '4px 0', fontSize: '12px' }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
