
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/cafe24Client';
import { useAuth } from '../../contexts/AuthContext';

const SurveyTestPage: React.FC = () => {
    const { user } = useAuth();
    const [step, setStep] = useState<'intro' | 'gender' | 'age' | 'role' | 'region' | 'career' | 'complete'>('intro');
    const [data, setData] = useState({
        gender: '',
        age: '',
        role: '',
        region: '',
        career: ''
    });
    const [customRegion, setCustomRegion] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Simplified Options (No icons, no descriptions)
    const genderOptions = [
        { value: 'male', label: '남성' },
        { value: 'female', label: '여성' }
    ];

    const ageOptions = [
        { value: '20s', label: '20대' },
        { value: '30s', label: '30대' },
        { value: '40s', label: '40대' },
        { value: '50plus', label: '50대 이상' }
    ];

    const roleOptions = [
        { value: 'leader', label: '리더 (Leader)' },
        { value: 'follower', label: '팔로워 (Follower)' },
        { value: 'both', label: '보스 (Both)' }
    ];

    const regionOptions = [
        { value: 'gangnam', label: '서울 강남' },
        { value: 'gangbuk', label: '서울 강북' },
        { value: 'bundang', label: '경기 남부' },
        { value: 'direct', label: '직접 입력' }
    ];

    const careerOptions = [
        { value: 'beginner', label: '입문~6개월' },
        { value: 'rookie', label: '6개월~1년' },
        { value: 'junior', label: '1년~3년' },
        { value: 'senior', label: '3년~10년' },
        { value: 'master', label: '10년 이상' }
    ];

    const handleNext = () => {
        if (step === 'intro') setStep('gender');
        else if (step === 'gender') setStep('age');
        else if (step === 'age') setStep('role');
        else if (step === 'role') setStep('region');
        else if (step === 'region') {
            if (data.region === 'direct' && !customRegion.trim()) {
                alert('지역을 입력해주세요.');
                return;
            }
            setStep('career');
        }
        else if (step === 'career') handleSubmit();
    };

    const handleSelect = (key: string, value: string) => {
        setData(prev => ({ ...prev, [key]: value }));

        // Auto advance logic
        if (key === 'region' && value === 'direct') return; // Don't auto advance for direct input

        setTimeout(() => {
            if (key === 'gender') setStep('age');
            if (key === 'age') setStep('role');
            if (key === 'role') setStep('region');
            if (key === 'region') setStep('career');
        }, 200);
    };

    const handleSubmit = async () => {
        setIsSaving(true);
        const finalData = {
            ...data,
            region: data.region === 'direct' ? customRegion : data.region
        };
        console.log('[Survey] Submitting data:', finalData);

        try {
            // Attempt to save to DB (will allow fail if columns don't exist)
            if (user) {
                /*
                // Actual Code would be:
                const { error } = await supabase
                    .from('board_users')
                    .update({
                        meta_gender: data.gender,
                        meta_role: data.role,
                        meta_region: data.region,
                        meta_career: data.career,
                        survey_completed_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id);
                */

                // Simulation
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Store completion in local storage to simulate "Never show again"
                localStorage.setItem('survey_completed_v1', 'true');
            }

            setStep('complete');
        } catch (e) {
            console.error(e);
            alert('저장 시뮬레이션 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#000',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: "'Pretendard', sans-serif"
        }}>
            {/* Progress Bar */}
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '4px', background: '#333' }}>
                <div style={{
                    height: '100%',
                    background: '#fbbf24',
                    width: step === 'intro' ? '0%' :
                        step === 'gender' ? '16%' :
                            step === 'age' ? '33%' :
                                step === 'role' ? '50%' :
                                    step === 'region' ? '66%' :
                                        step === 'career' ? '83%' : '100%',
                    transition: 'width 0.3s ease'
                }} />
            </div>

            {/* Content Card */}
            <div style={{
                width: '100%',
                maxWidth: '400px',
                background: '#18181b',
                borderRadius: '24px',
                padding: '32px 24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>

                {step === 'intro' && (
                    <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>📋</div>
                        <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>월간 빌보드 통계를 위한<br /><span style={{ color: '#fbbf24' }}>설문조사</span></h1>
                        <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: '1.6', marginBottom: '32px' }}>
                            <strong>스윙 씬의 전체적인 분위기와 흐름</strong>을<br />
                            파악하기 위한 통계 자료로 활용됩니다.
                        </p>
                        <button
                            onClick={handleNext}
                            style={btnStyle}
                        >
                            시작하기
                        </button>
                    </div>
                )}

                {step === 'gender' && (
                    <div style={{ animation: 'slideIn 0.3s' }}>
                        <h2 style={questionStyle}>성별을 알려주세요</h2>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {genderOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSelect('gender', opt.value)}
                                    style={{
                                        ...optionStyle,
                                        borderColor: data.gender === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        background: data.gender === opt.value ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'age' && (
                    <div style={{ animation: 'slideIn 0.3s' }}>
                        <h2 style={questionStyle}>연령대는 어떻게 되시나요?</h2>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {ageOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSelect('age', opt.value)}
                                    style={{
                                        ...optionStyle,
                                        borderColor: data.age === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        background: data.age === opt.value ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'role' && (
                    <div style={{ animation: 'slideIn 0.3s' }}>
                        <h2 style={questionStyle}>주로 추는 역할은?</h2>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {roleOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSelect('role', opt.value)}
                                    style={{
                                        ...optionStyle,
                                        borderColor: data.role === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        background: data.role === opt.value ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 'region' && (
                    <div style={{ animation: 'slideIn 0.3s' }}>
                        <h2 style={questionStyle}>주로 활동하는 지역은?</h2>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {regionOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handleSelect('region', opt.value)}
                                    style={{
                                        ...optionStyle,
                                        borderColor: data.region === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        background: data.region === opt.value ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Direct Input Field */}
                        {data.region === 'direct' && (
                            <div style={{ marginTop: '16px', animation: 'fadeIn 0.3s' }}>
                                <input
                                    type="text"
                                    placeholder="활동 지역 입력"
                                    value={customRegion}
                                    onChange={(e) => setCustomRegion(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
                                        borderRadius: '12px',
                                        border: '1px solid #fbbf24',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#fff',
                                        fontSize: '16px',
                                        outline: 'none',
                                        textAlign: 'center'
                                    }}
                                    autoFocus
                                />
                                <button
                                    onClick={handleNext}
                                    disabled={!customRegion.trim()}
                                    style={{ ...btnStyle, marginTop: '12px', opacity: !customRegion.trim() ? 0.5 : 1 }}
                                >
                                    확인
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 'career' && (
                    <div style={{ animation: 'slideIn 0.3s' }}>
                        <h2 style={questionStyle}>스윙 댄스 경력은?</h2>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {careerOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setData(prev => ({ ...prev, career: opt.value }))}
                                    style={{
                                        ...optionStyle,
                                        borderColor: data.career === opt.value ? '#fbbf24' : 'rgba(255,255,255,0.1)',
                                        background: data.career === opt.value ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <span style={{ fontSize: '16px', fontWeight: '500' }}>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={!data.career || isSaving}
                            style={{ ...btnStyle, marginTop: '24px', opacity: (!data.career || isSaving) ? 0.5 : 1 }}
                        >
                            {isSaving ? '저장 중...' : '완료하기'}
                        </button>
                    </div>
                )}

                {step === 'complete' && (
                    <div style={{ textAlign: 'center', animation: 'popIn 0.5s' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎉</div>
                        <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '12px' }}>참여해 주셔서 감사합니다!</h1>
                        <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: '1.6', marginBottom: '32px' }}>
                            제공해주신 소중한 데이터는<br />
                            다음 달 <strong>'월간 빌보드'</strong>에서<br />
                            흥미로운 인사이트로 다시 찾아뵙겠습니다.
                        </p>
                        <div style={{ background: '#27272a', padding: '16px', borderRadius: '12px', fontSize: '12px', color: '#71717a', textAlign: 'left', marginBottom: '24px' }}>
                            <strong>[수집된 데이터]</strong><br />
                            • 성별: {genderOptions.find(o => o.value === data.gender)?.label}<br />
                            • 연령: {ageOptions.find(o => o.value === data.age)?.label}<br />
                            • 역할: {roleOptions.find(o => o.value === data.role)?.label}<br />
                            • 지역: {data.region === 'direct' ? customRegion : regionOptions.find(o => o.value === data.region)?.label}<br />
                            • 경력: {careerOptions.find(o => o.value === data.career)?.label}
                        </div>
                        <button
                            onClick={() => window.location.href = '/'}
                            style={btnStyle}
                        >
                            메인으로 이동
                        </button>
                    </div>
                )}

            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes popIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
};

// Styles
const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px',
    borderRadius: '16px',
    border: 'none',
    background: '#fbbf24',
    color: '#000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.2s'
};

const optionStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    transition: 'all 0.2s'
};

const questionStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '24px',
    color: '#fff'
};

export default SurveyTestPage;
