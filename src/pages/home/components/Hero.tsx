import './Hero.css';

export default function Hero() {
  return (
    <section 
      className="hero-section"
      role="img"
      aria-label="모던한 이벤트 행사장, 무대 조명과 관객 실루엣"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://readdy.ai/api/search-image?query=modern%20event%20venue%20with%20stage%20lighting%20and%20audience%20silhouettes%2C%20dark%20atmospheric%20concert%20hall%20with%20purple%20and%20blue%20lighting%2C%20professional%20event%20photography%20style%2C%20high%20contrast%20dramatic%20lighting&width=1200&height=400&seq=hero1&orientation=landscape')`
      }}
    >
      <div className="hero-content-overlay">
        <div className="hero-content-wrapper">
          <h1 className="hero-title">
            Discover Amazing Events
          </h1>
          <p className="hero-subtitle">
            Find concerts, shows, workshops and more happening near you
          </p>
          <div className="hero-button-container">
            <button className="hero-btn-primary">
              Browse Events
            </button>
            <button className="hero-btn-secondary">
              Create Event
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
