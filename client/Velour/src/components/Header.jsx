import { useState } from 'react'

export default function Header({ cartCount = 0, activeCategory, onNavigate }) {
  const [exploreOpen, setExploreOpen] = useState(false)

  const navItems = [
    { label: 'Women', category: 'Clothing', filter: (p) => p.tags?.includes('women') },
    { label: 'Men', category: 'Clothing', filter: (p) => p.tags?.includes('men') },
    { label: 'Accessories', category: 'Accessories' },
    { label: 'Sports', category: 'Sports' },
  ]

  return (
    <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <button 
          onClick={() => onNavigate('All')} 
          className="text-lg font-medium tracking-widest uppercase hover:opacity-70 transition-opacity"
        >
          Velour
        </button>
        <nav className="hidden md:flex gap-8 text-sm text-gray-500 items-center">
          {navItems.map(({ label, category }) => (
            <button
              key={label}
              onClick={() => onNavigate(category)}
              className={`hover:text-gray-900 transition-colors ${
                activeCategory === category ? 'text-gray-900 font-medium' : ''
              }`}
            >
              {label}
            </button>
          ))}
          
          {/* Explore dropdown */}
          <div className="relative">
            <button
              onClick={() => setExploreOpen(!exploreOpen)}
              className="hover:text-gray-900 transition-colors"
            >
              Explore
            </button>
            {exploreOpen && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 shadow-lg rounded py-2 min-w-[140px]">
                <button
                  onClick={() => {
                    onNavigate('Outdoor')
                    setExploreOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-sm ${
                    activeCategory === 'Outdoor' ? 'text-gray-900 font-medium' : 'text-gray-500'
                  }`}
                >
                  Outdoor
                </button>
              </div>
            )}
          </div>

          {/* Go to client button - same style as nav links with added shadow */}
          <a
            href="https://www.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors shadow-sm"
          >
            Go to client
          </a>
        </nav>
        <button className="text-sm relative">
          Bag
          {cartCount > 0 && (
            <span className="ml-1 text-xs bg-gray-900 text-white rounded-full w-4 h-4 inline-flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile navigation */}
      <nav className="md:hidden border-t border-gray-100 py-3">
        <div className="flex justify-around text-xs text-gray-500 mb-3">
          {navItems.map(({ label, category }) => (
            <button
              key={label}
              onClick={() => onNavigate(category)}
              className={`hover:text-gray-900 transition-colors ${
                activeCategory === category ? 'text-gray-900 font-medium' : ''
              }`}
            >
              {label}
            </button>
          ))}
          
          {/* Mobile Explore dropdown */}
          <div className="relative">
            <button
              onClick={() => setExploreOpen(!exploreOpen)}
              className={`hover:text-gray-900 transition-colors ${
                activeCategory === 'Outdoor' ? 'text-gray-900 font-medium' : ''
              }`}
            >
              Explore
            </button>
            {exploreOpen && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border border-gray-100 shadow-lg rounded py-2 min-w-[140px]">
                <button
                  onClick={() => {
                    onNavigate('Outdoor')
                    setExploreOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-50 text-xs ${
                    activeCategory === 'Outdoor' ? 'text-gray-900 font-medium' : 'text-gray-500'
                  }`}
                >
                  Outdoor
                </button>
              </div>
            )}
          </div>

          {/* Mobile Go to client button - same style as nav links with added shadow */}
          <a
            href="https://www.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 transition-colors shadow-sm"
          >
            Go to client
          </a>
        </div>
      </nav>
    </header>
  )
}
