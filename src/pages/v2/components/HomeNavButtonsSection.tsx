import React from 'react';
import { useNavigate } from 'react-router-dom';
import "../../../styles/components/HomeNavButtonsSection.css";

interface HomeNavButtonsSectionProps {
    socialData?: { imageUrl: string; title: string; location: string }[];
    eventImages?: string[];
    classImages?: string[];
}

export const HomeNavButtonsSection: React.FC<HomeNavButtonsSectionProps> = ({
    socialData = [],
    eventImages = [],
    classImages = []
}) => {
    const navigate = useNavigate();

    const handleSocialClick = () => {
        navigate('/calendar?category=social&scrollToToday=true');
    };

    const handleEventsClick = () => {
        navigate('/events?section=events');
    };

    const handleClassesClick = () => {
        navigate('/events?section=classes');
    };

    // Default placeholders if data is missing
    const defaultSocialImages = [
        "https://images.unsplash.com/photo-1514525253361-bee873830dbb?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200&h=250&fit=crop"
    ];

    const defaultEventImages = [
        "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=200&h=250&fit=crop"
    ];

    const defaultClassImages = [
        "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=200&h=250&fit=crop",
        "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&h=250&fit=crop"
    ];

    const displaySocialData = socialData.length >= 3 ? socialData.slice(0, 3).reverse() : [
        { imageUrl: "https://images.unsplash.com/photo-1514525253361-bee873830dbb?w=200&h=250&fit=crop", title: "소셜 모임", location: "장소 미정" },
        { imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=250&fit=crop", title: "댄스 파티", location: "장소 미정" },
        { imageUrl: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=200&h=250&fit=crop", title: "주말 소셜", location: "강남/홍대" }
    ];
    // Note: slice(0,3).reverse() because map renders them in order, and we want the 3rd one to be the front-most top-layered card.

    const displayEventImages = eventImages.length >= 3 ? eventImages.slice(0, 3) : defaultEventImages;
    const displayClassImages = classImages.length >= 3 ? classImages.slice(0, 3) : defaultClassImages;


    const renderNavCard = (
        type: 'social' | 'event' | 'class',
        label: string,
        onClick: () => void,
        images: any[],
        behavior: string,
        target: string
    ) => {
        return (
            <button
                className={`HNBS-button HNBS-button--${type}`}
                onClick={onClick}
                aria-label={`${label} 보기`}
            >
                <div className="HNBS-bubble">{label}</div>
                
                <div className="HNBS-stack" aria-hidden="true">
                    {images.slice(0, 3).map((item, index) => {
                        const isFront = index === 2;
                        const imgUrl = typeof item === 'string' ? item : item.imageUrl;
                        return (
                            <span key={index} className={isFront ? 'is-front' : ''}>
                                <img src={imgUrl} alt="" loading="lazy" draggable={false} />
                                {isFront && typeof item === 'object' && item.title && (
                                    <b>
                                        <small>{item.location}</small>
                                        {item.title}
                                    </b>
                                )}
                            </span>
                        );
                    })}
                </div>

                <div className="HNBS-copy">
                    <strong>{behavior}</strong>
                    <span>{target}</span>
                </div>
            </button>
        );
    };

    return (
        <section className="HNBS-container">
            <div className="HNBS-grid">
                {renderNavCard(
                    'social', 
                    '소셜정보', 
                    handleSocialClick, 
                    displaySocialData, 
                    '달력의 소셜 탭으로 바로 이동', 
                    '/calendar?category=social'
                )}
                {renderNavCard(
                    'event', 
                    '행사정보', 
                    handleEventsClick, 
                    displayEventImages, 
                    '행사 전용 페이지로 이동', 
                    '/events'
                )}
                {renderNavCard(
                    'class', 
                    '강습정보', 
                    handleClassesClick, 
                    displayClassImages, 
                    '강습 전용 페이지로 이동', 
                    '/classes'
                )}
            </div>
        </section>
    );
};
