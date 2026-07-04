import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import { formatDateForInput } from '../../../utils/fileUtils';
import { parseDateSafe } from '../utils/eventListUtils';

interface BottomSheetProps {
    activeField: string | null;
    onClose: () => void;
    initialValue: any;
    onSave: (value: any, category?: string) => void;
    isSaving: boolean;
    event: any;
    structuredGenres: { class: string[]; event: string[] };
    allHistoricalGenres: string[];
}

const EventEditBottomSheet = React.memo(({
    activeField,
    onClose,
    initialValue,
    onSave,
    isSaving,
    structuredGenres,
    allHistoricalGenres
}: BottomSheetProps) => {
    const [editValue, setEditValue] = useState('');
    const [editCategory, setEditCategory] = useState<'event' | 'class' | 'club' | 'social'>('event');
    const [dateMode, setDateMode] = useState<'single' | 'dates'>('single');
    const [editScope, setEditScope] = useState<string>('domestic');
    const [linkEditValues, setLinkEditValues] = useState({
        link1: '', link_name1: '',
        link2: '', link_name2: '',
        link3: '', link_name3: ''
    });

    useEffect(() => {
        if (activeField === 'title') setEditValue(initialValue.title);
        if (activeField === 'time') setEditValue(initialValue.time || '');
        if (activeField === 'genre') {
            setEditValue(initialValue.genre || '');
            setEditScope(initialValue.scope || 'domestic');
            const category = initialValue.category;
            if (category === 'class' || category === 'club' || category === 'social') {
                setEditCategory(category);
            } else {
                setEditCategory('event');
            }
        }
        if (activeField === 'description') setEditValue(initialValue.description || '');
        if (activeField === 'mainAdImageKind') setEditValue(initialValue.main_ad_image_kind || 'auto');
        if (activeField === 'date') {
            const dates = initialValue.event_dates || [];
            if (dates.length > 0) {
                setDateMode('dates');
                setEditValue(dates.join(','));
            } else {
                setDateMode('single');
                setEditValue(initialValue.date || initialValue.start_date || '');
            }
        }
        if (activeField === 'links') {
            setLinkEditValues({
                link1: initialValue.link1 || '',
                link_name1: initialValue.link_name1 || '',
                link2: initialValue.link2 || '',
                link_name2: initialValue.link_name2 || '',
                link3: initialValue.link3 || '',
                link_name3: initialValue.link_name3 || ''
            });
        }
    }, [activeField, initialValue]);

    const uniqueGenres = useMemo(() => {
        if (editCategory === 'social') {
            return ['소셜'];
        }
        if (editCategory === 'club') {
            return ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
        }
        if (editCategory === 'class') {
            return ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
        }
        // 행사 (event) - 사용자 요청 원상 복구
        return ['워크샵', '파티', '대회', '라이브밴드', '기타'];
    }, [editCategory]);

    if (!activeField) return null;

    return createPortal(
        <div className="EDM-bottomSheetPortal">
            <div className="EDM-bottomSheetBackdrop" onClick={onClose} />
            <div className="EDM-bottomSheetContent">
                <div className="EDM-bottomSheetHandle"></div>
                <h3 className="EDM-bottomSheetHeader">
                    {activeField === 'title' && <><i className="ri-text"></i>제목 수정</>}
                    {activeField === 'genre' && <><i className="ri-price-tag-3-line"></i>장르 수정</>}
                    {activeField === 'time' && <><i className="ri-time-line"></i>시간 수정</>}
                    {activeField === 'description' && <><i className="ri-file-text-line"></i>오픈톡방/내용 수정</>}
                    {activeField === 'links' && <><i className="ri-link"></i>링크 수정</>}
                    {activeField === 'date' && <><i className="ri-calendar-check-line"></i>날짜 선택</>}
                    {activeField === 'mainAdImageKind' && <><i className="ri-image-line"></i>메인광고 판정</>}
                </h3>

                <div className="EDM-bottomSheetBody">
                    <div className="EDM-bottomSheetInputGroup">
                        {activeField === 'date' ? (
                            <div className="EDM-dateEditContainer">
                                <div className="EDM-dateModeToggle">
                                    <button onClick={() => { setDateMode('single'); setEditValue(''); }} className={`EDM-dateModeBtn ${dateMode === 'single' ? 'is-active' : ''}`}>하루</button>
                                    <button onClick={() => { setDateMode('dates'); setEditValue(''); }} className={`EDM-dateModeBtn ${dateMode === 'dates' ? 'is-active' : ''}`}>개별</button>
                                </div>
                                {dateMode === 'dates' && (
                                    <div className="EDM-selectedDatesContainer">
                                        <div className="EDM-selectedDatesList">
                                            {editValue.split(',').filter(Boolean).length > 0 ? (
                                                editValue.split(',').filter(Boolean).map(d => (
                                                    <div key={d} className="EDM-dateChip">
                                                        <span>{d.substring(5)}</span>
                                                        <button onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newDates = editValue.split(',').filter(Boolean).filter(ed => ed !== d);
                                                            setEditValue(newDates.join(','));
                                                        }} className="EDM-dateChipRemove"><i className="ri-close-line"></i></button>
                                                    </div>
                                                ))
                                            ) : <span className="EDM-emptyDatesHint">날짜를 선택해주세요</span>}
                                        </div>
                                    </div>
                                )}
                                <div className="EDM-calendarWrapper">
                                    <DatePicker
                                        selected={(() => {
                                            if (dateMode === 'single' && editValue) {
                                                const d = parseDateSafe(editValue);
                                                console.log('[DEBUG-EDM] selected date for single mode:', { editValue, parsed: d });
                                                return d;
                                            }
                                            return null;
                                        })()}
                                        onChange={(d: Date | null) => {
                                            if (!d) return;
                                            console.log('[DEBUG-EDM] DatePicker onChange (d):', d);
                                            console.log('[DEBUG-EDM] d.toString():', d.toString());

                                            const dateStr = formatDateForInput(d);
                                            console.log('[DEBUG-EDM] formatted dateStr:', dateStr);

                                            if (dateMode === 'single') setEditValue(dateStr);
                                            else {
                                                const currentDates = editValue.split(',').filter(Boolean);
                                                console.log('[DEBUG-EDM] currentDates:', currentDates);
                                                const newDates = currentDates.includes(dateStr) ? currentDates.filter(ed => ed !== dateStr) : [...currentDates, dateStr].sort();
                                                console.log('[DEBUG-EDM] newDates:', newDates);
                                                setEditValue(newDates.join(','));
                                            }
                                        }}
                                        highlightDates={dateMode === 'dates' ? editValue.split(',').filter(Boolean).map(d => {
                                            const hd = parseDateSafe(d);
                                            return hd;
                                        }) : []}
                                        locale={ko} inline monthsShown={1} shouldCloseOnSelect={dateMode === 'single'}
                                    />
                                </div>
                            </div>
                        ) : activeField === 'links' ? (
                            <div className="EDM-linksEditContainer">
                                <div className="EDM-inputGroup-v">
                                    <label className="EDM-inputLabel">링크</label>
                                    <input type="text" className="EDM-bottomSheetInput" value={linkEditValues.link_name1} onChange={(e) => setLinkEditValues({ ...linkEditValues, link_name1: e.target.value })} placeholder="링크 이름 (예: 신청하기)" />
                                    <input type="text" className="EDM-bottomSheetInput" value={linkEditValues.link1} onChange={(e) => setLinkEditValues({ ...linkEditValues, link1: e.target.value })} placeholder="URL (https://...)" />
                                </div>
                            </div>
                        ) : activeField === 'time' ? (
                            <div className="EDM-timeEditContainer">
                                <label className="EDM-inputLabel">시작 시간</label>
                                <input
                                    type="time"
                                    className="EDM-bottomSheetInput"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                />
                            </div>
                        ) : activeField === 'mainAdImageKind' ? (
                            <div className="EDM-mainAdKindEditContainer">
                                <div className="EDM-categoryToggle EDM-mainAdKindToggle">
                                    <button
                                        onClick={() => setEditValue('auto')}
                                        className={`EDM-categoryToggleBtn ${editValue === 'auto' ? 'is-active' : ''}`}
                                    >
                                        자동
                                    </button>
                                    <button
                                        onClick={() => setEditValue('photo')}
                                        className={`EDM-categoryToggleBtn ${editValue === 'photo' ? 'is-active' : ''}`}
                                    >
                                        사진
                                    </button>
                                    <button
                                        onClick={() => setEditValue('poster')}
                                        className={`EDM-categoryToggleBtn ${editValue === 'poster' ? 'is-active' : ''}`}
                                    >
                                        포스터
                                    </button>
                                </div>
                                <div className="EDM-mainAdKindSummary">
                                    {editValue === 'poster' ? '원본 디자인 유지' : editValue === 'photo' ? '제목 오버레이 표시' : '포스터 확실할 때만 원본 유지'}
                                </div>
                            </div>
                        ) : activeField === 'genre' ? (
                            <div className="EDM-genreEditContainer">
                                <div className="EDM-categoryToggle">
                                    <button onClick={() => { setEditCategory('event'); setEditValue(''); }} className={`EDM-categoryToggleBtn ${editCategory === 'event' ? 'is-active' : ''}`}>행사</button>
                                    <button onClick={() => { setEditCategory('class'); setEditValue(''); }} className={`EDM-categoryToggleBtn ${editCategory === 'class' ? 'is-active' : ''}`}>
                                        <span className="manual-label-wrapper"><span className="translated-part">Class</span><span className="fixed-part ko" translate="no">강습</span><span className="fixed-part en" translate="no">Class</span></span>
                                    </button>
                                    <button onClick={() => { setEditCategory('club'); setEditValue(''); }} className={`EDM-categoryToggleBtn is-club ${editCategory === 'club' ? 'is-active' : ''}`}>동호회</button>
                                    <button onClick={() => { setEditCategory('social'); setEditValue('소셜'); }} className={`EDM-categoryToggleBtn is-social ${editCategory === 'social' ? 'is-active' : ''}`}>소셜</button>
                                </div>

                                {editCategory === 'event' && (
                                    <div className="EDM-genreHint">
                                        <i className="ri-information-line"></i> 행사 장르는 중복 선택이 가능합니다.<br />
                                        (단, 대회와 파티는 동시 선택이 불가합니다)
                                    </div>
                                )}
                                {(editCategory === 'class' || editCategory === 'club') && (
                                    <div className="EDM-genreHint">
                                        <i className="ri-information-line"></i> 한 가지만 선택 가능합니다.
                                    </div>
                                )}

                                <div className="EDM-genreChipList is-flex-layout">
                                    {uniqueGenres.map((genre: string) => {
                                        const currentList = editValue ? editValue.split(',').map(s => s.trim()).filter(Boolean) : [];
                                        const isActive = currentList.includes(genre);
                                        return (
                                            <button key={genre} onClick={(e) => {
                                                e.preventDefault(); e.stopPropagation();
                                                let newGenres: string[];
                                                // 강습, 동호회, 소셜은 단일 선택 모드
                                                if (editCategory === 'class' || editCategory === 'club' || editCategory === 'social') {
                                                    newGenres = isActive ? [] : [genre];
                                                } else {
                                                    if (isActive) newGenres = currentList.filter(g => g !== genre);
                                                    else {
                                                        let temp = [...currentList];
                                                        // '기타' 선택 시 다른 모든 장르 해제
                                                        if (genre === '기타') {
                                                            temp = ['기타'];
                                                        } else {
                                                            // 다른 장르 선택 시 '기타' 해제
                                                            temp = temp.filter(g => g !== '기타');
                                                            if (genre === '파티') temp = temp.filter(g => g !== '대회');
                                                            else if (genre === '대회') temp = temp.filter(g => g !== '파티');
                                                            temp = [...temp, genre];
                                                        }
                                                        newGenres = temp;
                                                    }
                                                }
                                                setEditValue(newGenres.join(','));
                                            }} className={`EDM-genreChip ${isActive ? 'is-active' : ''} ${editCategory === 'club' && isActive ? 'is-club' : ''}`}>{genre}</button>
                                        );
                                    })}
                                </div>

                                {editCategory === 'event' && (
                                    <div className="EDM-scopeEditSection">
                                        <div className="EDM-inputLabel-small">지역 구분</div>
                                        <div className="EDM-scopeToggle">
                                            <button
                                                onClick={() => setEditScope('domestic')}
                                                className={`EDM-scopeBtn ${editScope === 'domestic' ? 'is-active' : ''}`}
                                            >
                                                🇰🇷 국내
                                            </button>
                                            <button
                                                onClick={() => setEditScope('overseas')}
                                                className={`EDM-scopeBtn is-overseas ${editScope === 'overseas' ? 'is-active' : ''}`}
                                            >
                                                🌏 해외
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <textarea className="EDM-bottomSheetTextarea" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder={activeField === 'title' ? "행사 제목을 입력하세요" : "내용을 입력하세요"} rows={activeField === 'title' ? 3 : 8} autoFocus />
                        )}
                    </div>
                </div>
                <div className="EDM-bottomSheetFooter">
                    <button
                        onClick={() => {
                            if (activeField === 'links') {
                                onSave(linkEditValues, editCategory);
                            } else if (activeField === 'genre') {
                                onSave({ genre: editValue, scope: editScope }, editCategory);
                            } else if (activeField === 'mainAdImageKind') {
                                onSave(editValue === 'auto' ? null : editValue, editCategory);
                            } else {
                                onSave(editValue, editCategory);
                            }
                        }}
                        className="EDM-bottomSheet-btn-submit"
                        disabled={isSaving}
                    >
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default EventEditBottomSheet;
