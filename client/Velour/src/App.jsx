import { useState } from 'react'
import Header from './components/Header'
import ProductGrid from './components/ProductGrid'
import OutdoorComingSoon from './components/OutdoorComingSoon'
import { products as allProducts, categories } from './data/products'

export default function App() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [cart, setCart] = useState([])

  const filtered = activeCategory === 'All'
    ? allProducts
    : allProducts.filter(p => p.category === activeCategory)

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
  }

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

  // Get page title and description based on category
  const getPageInfo = () => {
    switch (activeCategory) {
      case 'Sports':
        return {
          title: 'Sports',
          description: 'Premium tennis equipment',
        }
      case 'Clothing':
        return {
          title: 'Clothing',
          description: 'Premium clothing',
        }
      case 'Accessories':
        return {
          title: 'Accessories',
          description: 'Premium accessories',
        }
      case 'Outdoor':
        return null // Outdoor has its own page component
      default:
        return {
          title: 'New In',
          description: 'Premium clothing and accessories',
        }
    }
  }

  const pageInfo = getPageInfo()

  return (
    <div className="min-h-screen font-sans">
      <Header 
        cartCount={cartCount} 
        activeCategory={activeCategory}
        onNavigate={setActiveCategory}
      />

      {/* Show Outdoor coming soon page if Outdoor category selected */}
      {activeCategory === 'Outdoor' ? (
        <OutdoorComingSoon />
      ) : (
        <main className="max-w-6xl mx-auto px-4 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-light tracking-wide mb-1">{pageInfo.title}</h1>
            <p className="text-sm text-gray-400">{pageInfo.description}</p>
          </div>

          <div className="flex gap-6 mb-8 text-sm border-b border-gray-100 pb-4">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`pb-1 transition-colors ${
                  activeCategory === cat
                    ? 'text-gray-900 border-b border-gray-900'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <ProductGrid products={filtered} onAddToCart={addToCart} />
        </main>
      )}
    </div>
  )
}
