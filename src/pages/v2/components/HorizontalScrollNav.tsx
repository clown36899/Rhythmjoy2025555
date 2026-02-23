import { useRef, useState, useEffect, useCallback, cloneElement, isValidElement, forwardRef, useImperativeHandle } from 'react';
import '../styles/HorizontalScrollNav.css';

interface HorizontalScrollNavProps {
    children: React.ReactNode;
    className?: string;
    scrollAmount?: number;
}

export const HorizontalScrollNav = forwardRef<HTMLDivElement, HorizontalScrollNavProps>(({
    children,
    className = '',
    scrollAmount = 300
}, ref) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // Expose the internal container ref to the parent
    useImperativeHandle(ref, () => scrollContainerRef.current as HTMLDivElement);

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

        let ticking = false;
        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    checkScrollability();
                    ticking = false;
                });
                ticking = true;
            }
        };

        // Throttle resize as well 
        let resizeTimeout: NodeJS.Timeout;
        const handleResize = () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(checkScrollability, 150);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);

        // Also check after a short delay to account for dynamic content
        const timer = setTimeout(checkScrollability, 100);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            clearTimeout(timer);
            clearTimeout(resizeTimeout);
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
        ? cloneElement(children as React.ReactElement<{ ref: React.Ref<HTMLDivElement> }>, { ref: scrollContainerRef })
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
});
