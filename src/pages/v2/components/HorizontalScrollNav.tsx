import { useRef, useState, useEffect, useCallback, cloneElement, isValidElement } from 'react';
import '../styles/HorizontalScrollNav.css';

interface HorizontalScrollNavProps {
    children: React.ReactNode;
    className?: string;
    scrollAmount?: number;
}

export const HorizontalScrollNav = ({
    children,
    className = '',
    scrollAmount = 300
}: HorizontalScrollNavProps) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScrollability = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Initial check
        checkScrollability();

        const handleScroll = () => checkScrollability();
        const handleResize = () => checkScrollability();

        container.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleResize);

        // Also check after a short delay to account for dynamic content
        const timer = setTimeout(checkScrollability, 100);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            clearTimeout(timer);
        };
    }, [checkScrollability]);

    const scroll = (direction: 'left' | 'right') => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollBy = direction === 'left' ? -scrollAmount : scrollAmount;
        container.scrollBy({ left: scrollBy, behavior: 'smooth' });
    };

    // Clone the child element and attach the ref to it
    const childWithRef = isValidElement(children)
        ? cloneElement(children as React.ReactElement<any>, { ref: scrollContainerRef })
        : children;

    return (
        <div className={`horizontal-scroll-nav-wrapper ${className}`}>
            <button
                className={`scroll-nav-btn scroll-nav-btn-left ${!canScrollLeft ? 'disabled' : ''}`}
                onClick={() => scroll('left')}
                disabled={!canScrollLeft}
                aria-label="이전으로 스크롤"
            >
                <i className="ri-arrow-left-s-line"></i>
            </button>

            {childWithRef}

            <button
                className={`scroll-nav-btn scroll-nav-btn-right ${!canScrollRight ? 'disabled' : ''}`}
                onClick={() => scroll('right')}
                disabled={!canScrollRight}
                aria-label="다음으로 스크롤"
            >
                <i className="ri-arrow-right-s-line"></i>
            </button>
        </div>
    );
};
