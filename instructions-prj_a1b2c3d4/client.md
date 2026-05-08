# Client Context — Velour

This file describes the client, their brand, and what they care about. Agents should use this when planning tasks to ensure work aligns with business goals and customer expectations.

## About the Client

**Velour** is a modern fashion e-commerce brand selling premium clothing and accessories. The range covers:
- **Clothing**: Everyday basics, seasonal collections, occasion wear (women's, men's, unisex)
- **Accessories**: Bags, belts, jewellery, scarves, hats, sunglasses
- **Brand positioning**: Accessible luxury — quality materials, clean design, mid-to-high price point

The client is a small in-house team (founder + 2 developers) building their own platform rather than using Shopify or similar, because they want full control over the customer experience and data.

## Client Priorities (in order)

1. **Conversion** — every feature should make it easier to browse, discover, and buy
2. **Performance** — fast page loads, snappy UI; slow = lost sales
3. **Mobile-first** — majority of their traffic is on mobile
4. **Inventory accuracy** — stock levels must be real-time; overselling is a critical failure
5. **Brand feel** — clean, minimal, slightly editorial; nothing cluttered or cheap-looking

## Target Customers

- Women 25–45, fashion-conscious, values quality over quantity
- Buys online regularly; expects smooth checkout, easy returns
- Browses on phone, often completes purchase on desktop
- Responds to editorial content (lookbooks, styling tips) alongside product listings

## Communication Style

- Concise and direct — the team moves fast
- Flag trade-offs when they exist (e.g. performance vs. feature richness)
- Design decisions should reference the brand feel: clean, minimal, editorial
- Business impact first, then technical detail

## What the Client Considers Done

A feature is "done" when:
- It works correctly on mobile and desktop
- It doesn't break the checkout flow or inventory sync
- It looks on-brand (no placeholder styles shipped to production)
- It has been reviewed and approved by the human

## Things the Client Cares About

- Real-time stock sync — no stale cache showing items as in-stock when they aren't
- Smooth checkout — as few steps as possible; guest checkout supported
- Product discovery — search, filters, and recommendations that actually help
- Returns and order management — customers need self-service returns
- SEO — product pages need proper meta, schema markup, clean URLs

## Things to Avoid

- Over-building before validation — ship small, iterate fast
- Checkout friction — don't add steps or required fields unnecessarily
- Cluttered UI — the brand aesthetic is minimal; resist feature creep in the interface
- Silent stock errors — always log and surface inventory discrepancies
- Generic copy or placeholder content left in production
