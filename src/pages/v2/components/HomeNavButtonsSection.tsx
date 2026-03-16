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
        const target = document.querySelector('.ELS-section--upcoming');
        if (target) {
            const headerOffset = 110;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    };

    const handleClassesClick = () => {
        const target = document.querySelector('.ELS-section--classes');
        if (target) {
            const headerOffset = 110;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
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


    return (
        <section className="HNBS-container">
            <button
                className="HNBS-button HNBS-button--social"
                onClick={handleSocialClick}
                aria-label="소셜 정보 바로가기"
                data-analytics-id="home_quick_social"
                data-analytics-type="nav_item"
                data-analytics-title="소셜정보 퀵링크"
                data-analytics-section="home_v2_nav"
            >
                <div className="HNBS-bubble">소셜정보</div>
                <div className="HNBS-stack">
                    {displaySocialData.map((item, i) => {
                        const isFront = i === 2; // Last item in array becomes the top-most z-index item
                        return (
                            <div
                                key={i}
                                className={`HNBS-stack-item ${isFront ? 'HNBS-stack-item--front' : ''}`}
                                style={isFront ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
                            >
                                {isFront ? (
                                    <div className="HNBS-card-content">
                                        <div className="HNBS-circle-image">
                                            <img src={item.imageUrl} alt="" />
                                        </div>
                                        <div className="HNBS-card-info">
                                            <div className="HNBS-card-location">{item.location}</div>
                                            <div className="HNBS-card-title">{item.title}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <img src={item.imageUrl} alt="" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </button>

            <button
                className="HNBS-button HNBS-button--events"
                onClick={handleEventsClick}
                aria-label="행사 정보 보기"
                data-analytics-id="home_quick_events"
                data-analytics-type="action"
                data-analytics-title="행사정보 스크롤"
                data-analytics-section="home_v2_nav"
            >
                <div className="HNBS-bubble">행사정보</div>
                <div className="HNBS-stack">
                    {displayEventImages.map((img, i) => (
                        <div key={i} className="HNBS-stack-item">
                            <img src={img} alt="" />
                        </div>
                    ))}
                </div>
            </button>

            <button
                className="HNBS-button HNBS-button--classes"
                onClick={handleClassesClick}
                aria-label="강습 정보 보기"
                data-analytics-id="home_quick_classes"
                data-analytics-type="action"
                data-analytics-title="강습정보 스크롤"
                data-analytics-section="home_v2_nav"
            >
                <div className="HNBS-bubble">강습정보</div>
                <div className="HNBS-stack">
                    {displayClassImages.map((img, i) => (
                        <div key={i} className="HNBS-stack-item">
                            <img src={img} alt="" />
                        </div>
                    ))}
                </div>
            </button>
        </section>
    );
};

