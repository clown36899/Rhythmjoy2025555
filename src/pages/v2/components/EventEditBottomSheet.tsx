import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from "react-datepicker";
import { ko } from "date-fns/locale/ko";

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
    const [editCategory, setEditCategory] = useState<'event' | 'class' | 'club'>('event');
    const [dateMode, setDateMode] = useState<'single' | 'dates'>('single');
    const [linkEditValues, setLinkEditValues] = useState({
        link1: '', link_name1: '',
        link2: '', link_name2: '',
        link3: '', link_name3: ''
    });

    useEffect(() => {
        if (activeField === 'title') setEditValue(initialValue.title);
        if (activeField === 'genre') {
            setEditValue(initialValue.genre || '');
            setEditCategory((initialValue.category === 'class' || initialValue.category === 'club') ? initialValue.category : 'event');
        }
        if (activeField === 'description') setEditValue(initialValue.description || '');
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
        const propGenres = editCategory === 'club'
            ? (structuredGenres['class'] || [])
            : (structuredGenres[editCategory as keyof typeof structuredGenres] || []);

        const combined = [...propGenres, ...allHistoricalGenres];

        if (editCategory === 'club') {
            return ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집'];
        }

        return Array.from(new Set(
            combined.flatMap(g => g.split(',')).map(s => s.trim()).filter(s => s && s.length > 0)
        )).sort();
    }, [editCategory, structuredGenres, allHistoricalGenres]);

    if (!activeField) return null;

    return createPortal(
        <div className="EDM-bottomSheetPortal">
            <div className="EDM-bottomSheetBackdrop" onClick={onClose} />
            <div className="EDM-bottomSheetContent">
                <div className="EDM-bottomSheetHandle"></div>
                <h3 className="EDM-bottomSheetHeader">
                    {activeField === 'title' && <><i className="ri-text"></i>제목 수정</>}
                    {activeField === 'genre' && <><i className="ri-price-tag-3-line"></i>장르 수정</>}
                    {activeField === 'description' && <><i className="ri-file-text-line"></i>오픈톡방/내용 수정</>}
                    {activeField === 'links' && <><i className="ri-link"></i>링크 수정</>}
                    {activeField === 'date' && <><i className="ri-calendar-check-line"></i>날짜 선택</>}
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
                                        selected={dateMode === 'single' && editValue ? new Date(editValue) : null}
                                        onChange={(d: Date | null) => {
                                            if (!d) return;
                                            const dateStr = d.toISOString().split('T')[0];
                                            if (dateMode === 'single') setEditValue(dateStr);
                                            else {
                                                const currentDates = editValue.split(',').filter(Boolean);
                                                const newDates = currentDates.includes(dateStr) ? currentDates.filter(ed => ed !== dateStr) : [...currentDates, dateStr].sort();
                                                setEditValue(newDates.join(','));
                                            }
                                        }}
                                        highlightDates={dateMode === 'dates' ? editValue.split(',').filter(Boolean).map(d => new Date(d)) : []}
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
                        ) : activeField === 'genre' ? (
                            <div className="EDM-genreEditContainer">
                                <div className="EDM-categoryToggle">
                                    <button onClick={() => { setEditCategory('event'); setEditValue(''); }} className={`EDM-categoryToggleBtn ${editCategory === 'event' ? 'is-active' : ''}`}>행사</button>
                                    <button onClick={() => { setEditCategory('class'); setEditValue(''); }} className={`EDM-categoryToggleBtn ${editCategory === 'class' ? 'is-active' : ''}`}>
                                        <span className="manual-label-wrapper"><span className="translated-part">Class</span><span className="fixed-part ko" translate="no">강습</span><span className="fixed-part en" translate="no">Class</span></span>
                                    </button>
                                    <button onClick={() => { setEditCategory('club'); setEditValue(''); }} className={`EDM-categoryToggleBtn is-club ${editCategory === 'club' ? 'is-active' : ''}`}>동호회</button>
                                </div>
                                <div className="EDM-genreChipList is-flex-layout">
                                    {uniqueGenres.map((genre: string) => {
                                        const currentList = editValue ? editValue.split(',').map(s => s.trim()).filter(Boolean) : [];
                                        const isActive = currentList.includes(genre);
                                        return (
                                            <button key={genre} onClick={(e) => {
                                                e.preventDefault(); e.stopPropagation();
                                                let newGenres: string[];
                                                if (editCategory === 'class' || editCategory === 'club') newGenres = isActive ? [] : [genre];
                                                else {
                                                    if (isActive) newGenres = currentList.filter(g => g !== genre);
                                                    else {
                                                        let temp = [...currentList];
                                                        if (genre === '파티') temp = temp.filter(g => g !== '대회');
                                                        else if (genre === '대회') temp = temp.filter(g => g !== '파티');
                                                        newGenres = [...temp, genre];
                                                    }
                                                }
                                                setEditValue(newGenres.join(','));
                                            }} className={`EDM-genreChip ${isActive ? 'is-active' : ''} ${editCategory === 'club' && isActive ? 'is-club' : ''}`}>{genre}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <textarea className="EDM-bottomSheetTextarea" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder={activeField === 'title' ? "행사 제목을 입력하세요" : "내용을 입력하세요"} rows={activeField === 'title' ? 3 : 8} autoFocus />
                        )}
                    </div>
                </div>
                <div className="EDM-bottomSheetFooter">
                    <button onClick={() => onSave(activeField === 'links' ? linkEditValues : editValue, editCategory)} className="EDM-bottomSheet-btn-submit" disabled={isSaving}>
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default EventEditBottomSheet;
