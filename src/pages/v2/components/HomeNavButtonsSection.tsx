import React from 'react';
import { useNavigate } from 'react-router-dom';
import "../../../styles/components/HomeNavButtonsSection.css";

interface HomeNavButtonsSectionProps {
    socialImages?: string[];
    eventImages?: string[];
    classImages?: string[];
}

export const HomeNavButtonsSection: React.FC<HomeNavButtonsSectionProps> = ({
    socialImages = [],
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

    const displaySocialImages = socialImages.length >= 3 ? socialImages.slice(0, 3) : defaultSocialImages;
    const displayEventImages = eventImages.length >= 3 ? eventImages.slice(0, 3) : defaultEventImages;
    const displayClassImages = classImages.length >= 3 ? classImages.slice(0, 3) : defaultClassImages;


    return (
        <section className="HNBS-container">
            <button
                className="HNBS-button HNBS-button--social"
                onClick={handleSocialClick}
                aria-label="소셜 정보 바로가기"
            >
                <div className="HNBS-bubble">소셜정보</div>
                <div className="HNBS-stack">
                    {displaySocialImages.map((img, i) => (
                        <div key={i} className="HNBS-stack-item">
                            <img src={img} alt="" />
                        </div>
                    ))}
                </div>
            </button>

            <button
                className="HNBS-button HNBS-button--events"
                onClick={handleEventsClick}
                aria-label="행사 정보 보기"
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

