
export default function Hero() {
  return (
    <section 
      className="relative h-96 bg-cover bg-center bg-gray-800"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://readdy.ai/api/search-image?query=modern%20event%20venue%20with%20stage%20lighting%20and%20audience%20silhouettes%2C%20dark%20atmospheric%20concert%20hall%20with%20purple%20and%20blue%20lighting%2C%20professional%20event%20photography%20style%2C%20high%20contrast%20dramatic%20lighting&width=1200&height=400&seq=hero1&orientation=landscape')`
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center max-w-4xl px-4">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-white">
            Discover Amazing Events
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-8">
            Find concerts, shows, workshops and more happening near you
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-lg font-semibold transition-colors whitespace-nowrap cursor-pointer">
              Browse Events
            </button>
            <button className="border-2 border-white text-white hover:bg-white hover:text-gray-900 px-8 py-3 rounded-lg text-lg font-semibold transition-colors whitespace-nowrap cursor-pointer">
              Create Event
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
