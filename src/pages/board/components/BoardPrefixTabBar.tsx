import { useRef, useLayoutEffect } from 'react';
import './BoardPrefixTabBar.css';

interface BoardPrefixTabBarProps {
    prefixes: any[];
    selectedPrefixId: number | null;
    onPrefixChange: (id: number | null) => void;
}

export default function BoardPrefixTabBar({ prefixes, selectedPrefixId, onPrefixChange }: BoardPrefixTabBarProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);

    // Auto-scroll to active item
    useLayoutEffect(() => {
        if (activeRef.current && scrollerRef.current) {
            activeRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [selectedPrefixId]);

    // 실제 데이터가 없으면 렌더링하지 않음
    if (prefixes.length === 0) return null;

    return (
        <div className="board-prefix-tab-bar">
            <div className="board-prefix-scroller" ref={scrollerRef}>
                <button
                    className={`board-prefix-item ${selectedPrefixId === null ? 'active' : ''}`}
                    onClick={() => onPrefixChange(null)}
                    ref={selectedPrefixId === null ? activeRef : null}
                >
                    전체
                </button>
                {prefixes.map((prefix) => (
                    <button
                        key={prefix.id}
                        className={`board-prefix-item ${selectedPrefixId === prefix.id ? 'active' : ''}`}
                        onClick={() => onPrefixChange(prefix.id)}
                        ref={selectedPrefixId === prefix.id ? activeRef : null}
                        style={{
                            color: selectedPrefixId === prefix.id ? prefix.color : undefined,
                            borderColor: selectedPrefixId === prefix.id ? prefix.color : undefined
                        }}
                    >
                        {prefix.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
