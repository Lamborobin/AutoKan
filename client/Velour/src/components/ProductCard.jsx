import { useState } from 'react'

export default function ProductCard({ product, onAddToCart }) {
  const [imageError, setImageError] = useState(false)

  return (
    <div className="group">
      <div className="bg-gray-50 aspect-[3/4] mb-3 overflow-hidden">
        {product.image && !imageError ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs uppercase tracking-widest">
            Velour
          </div>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-400 uppercase tracking-wider">{product.category}</p>
        <h3 className="text-sm font-medium">{product.name}</h3>
        <p className="text-sm">£{product.price}</p>
        {!product.inStock && (
          <p className="text-xs text-gray-400">Out of stock</p>
        )}
      </div>
      <button
        onClick={() => onAddToCart(product)}
        disabled={!product.inStock}
        className="mt-3 w-full py-2 text-xs uppercase tracking-wider border border-gray-900 hover:bg-gray-900 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {product.inStock ? 'Add to Bag' : 'Sold Out'}
      </button>
    </div>
  )
}
