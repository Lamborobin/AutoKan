export default function OutdoorComingSoon() {
  const placeholderItems = [
    {
      id: 'outdoor-1',
      name: 'Premium Fishing Rods',
      description: 'Professional-grade fishing rods for all conditions',
      image: 'https://images.unsplash.com/photo-1590845947670-c009801ffa74?w=600&h=800&fit=crop',
    },
    {
      id: 'outdoor-2',
      name: 'Fishing Nets',
      description: 'Durable nets for catch and release',
      image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=800&fit=crop',
    },
    {
      id: 'outdoor-3',
      name: 'Fishing Hats',
      description: 'UV protection and style for long days on the water',
      image: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?w=600&h=800&fit=crop',
    },
    {
      id: 'outdoor-4',
      name: 'Fishing Clothing',
      description: 'Technical apparel for comfort and performance',
      image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&h=800&fit=crop',
    },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-light tracking-wide mb-3">Outdoor</h1>
        <p className="text-sm text-gray-400 mb-6">
          Premium fishing equipment and apparel
        </p>
        <div className="inline-block bg-gray-50 border border-gray-100 rounded px-6 py-3">
          <p className="text-sm font-medium text-gray-900 mb-1">Coming Soon</p>
          <p className="text-xs text-gray-500">
            We're preparing our outdoor collection. Check back soon.
          </p>
        </div>
      </div>

      {/* Placeholder Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {placeholderItems.map((item) => (
          <div
            key={item.id}
            className="group relative"
          >
            <div className="aspect-[3/4] bg-gray-100 rounded overflow-hidden mb-3 relative">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-white/90 backdrop-blur-sm text-xs font-medium text-gray-900 px-4 py-2 rounded">
                  Coming Soon
                </span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                {item.name}
              </h3>
              <p className="text-xs text-gray-500">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer message */}
      <div className="mt-16 text-center border-t border-gray-100 pt-8">
        <p className="text-sm text-gray-500">
          Want to be notified when Outdoor launches?{' '}
          <button className="underline hover:text-gray-900 transition-colors">
            Join the waitlist
          </button>
        </p>
      </div>
    </div>
  )
}
