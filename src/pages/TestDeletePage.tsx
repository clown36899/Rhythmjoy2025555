import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const TestDeletePage = () => {
    const [targetType, setTargetType] = useState<'group' | 'schedule'>('schedule');
    const [targetId, setTargetId] = useState('');
    const [password, setPassword] = useState('');
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleTestDelete = async () => {
        setLogs([]);
        addLog(`Starting delete test for ${targetType} ID: ${targetId}`);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            addLog(token ? 'Token found' : 'No token found (acting as guest)');

            const payload = {
                type: targetType,
                id: targetId,
                password: password
            };

            addLog(`Sending payload: ${JSON.stringify(payload)}`);

            const response = await fetch('/.netlify/functions/delete-social-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(payload)
            });

            addLog(`Response Status: ${response.status}`);

            const result = await response.json();
            addLog(`Result: ${JSON.stringify(result, null, 2)}`);

        } catch (error: any) {
            addLog(`Error: ${error.message}`);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', paddingTop: '100px' }}>
            <h1>Delete Function Test</h1>

            <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc' }}>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ marginRight: '10px' }}>Type:</label>
                    <select value={targetType} onChange={(e) => setTargetType(e.target.value as any)}>
                        <option value="schedule">Schedule (일정)</option>
                        <option value="group">Group (단체)</option>
                    </select>
                </div>

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Target ID:</label>
                    <input
                        type="text"
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        placeholder="ID to delete"
                        style={{ width: '100%', padding: '5px' }}
                    />
                </div>

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Password (Optional):</label>
                    <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Admin password if needed"
                        style={{ width: '100%', padding: '5px' }}
                    />
                </div>

                <button
                    onClick={handleTestDelete}
                    style={{
                        background: 'red', color: 'white', border: 'none',
                        padding: '10px 20px', borderRadius: '5px', cursor: 'pointer'
                    }}
                >
                    Execute Delete
                </button>
            </div>

            <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '5px', minHeight: '200px' }}>
                <h3>Logs:</h3>
                {logs.map((log, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '4px' }}>
                        {log}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TestDeletePage;
