# Project Context — Velour E-Commerce Platform

This file gives all agents background knowledge about the project so they can ask smarter questions, implement correctly, and test accurately.

## What Are We Building?

A bespoke e-commerce platform for **Velour**, a fashion brand selling clothing and accessories. The platform replaces a third-party hosted store with a fully custom solution the team owns end-to-end.

Core modules:
- **Product catalogue** — listings, variants (size/colour), media, stock levels
- **Collections** — editorial groupings (e.g. "Summer Edit", "Bestsellers", "New In")
- **Customer accounts** — registration, login, order history, saved addresses
- **Shopping cart + checkout** — guest and authenticated, Stripe payments, address validation
- **Order management** — status tracking, fulfilment workflow, returns/refunds
- **Admin panel** — product management, order processing, stock updates, discount codes
- **Content** — lookbook/editorial pages, homepage hero, homepage featured collections

## Tech Stack

- **Backend**: Node.js + Express + PostgreSQL (via `pg`) — port 3001
- **Frontend**: React + Tailwind CSS + Vite — port 5173
- **State**: Zustand + React Query (server state)
- **Payments**: Stripe (checkout sessions + webhooks)
- **Image storage**: Cloudinary (product images, editorial photos)
- **Search**: PostgreSQL full-text search (no Elasticsearch yet)
- **Auth**: JWT (access tokens) + refresh tokens stored in HTTP-only cookies
- **Email**: Resend (transactional — order confirmation, shipping updates, password reset)
- **Deployment**: Railway (backend), Vercel (frontend)

## Project Structure

```
velour/
├── server/
│   ├── src/
│   │   ├── db/              # Migrations, schema, seed data
│   │   ├── middleware/      # auth.js, errorHandler.js, validate.js
│   │   ├── routes/          # products, collections, orders, customers, admin, webhooks
│   │   ├── services/        # stripe.js, cloudinary.js, email.js, inventory.js
│   │   └── index.js
├── app/
│   ├── src/
│   │   ├── api/             # Axios client + per-resource API modules
│   │   ├── store/           # Zustand store (cart, user session, UI)
│   │   ├── hooks/           # useCart, useAuth, useProducts, etc.
│   │   ├── components/      # Shared UI (Button, Modal, ProductCard, etc.)
│   │   └── pages/           # Home, PDP, PLP, Cart, Checkout, Account, Admin
├── instructions/            # Agent system prompts and context files
└── data/                    # Local dev DB dumps / seed files
```

## Coding Conventions

- Backend: Node.js CommonJS (`require`/`module.exports`), no TypeScript
- Frontend: React functional components, hooks, JSX, Tailwind utility classes
- Database: raw SQL via `pg` (`pool.query()`), no ORM
- API: REST, JSON responses; errors use `{ error: "message", code?: "ERROR_CODE" }` shape
- Auth: `Authorization: Bearer <token>` on protected routes; refresh token in cookie
- Images: always use Cloudinary transformation URLs, never raw upload paths
- Prices: stored as integers (pence/cents), displayed with `formatPrice()` helper

## Key Domain Rules

- **Inventory**: Stock is tracked per variant (product + size + colour combination). Decrement on order placement, restore on cancellation/return.
- **Pricing**: Base price on product, optional sale price. Both stored in pence. Display layer formats them.
- **Variants**: A product always has at least one variant. Variants hold `sku`, `stock`, `size`, `colour`.
- **Orders**: Status flow: `pending → confirmed → processing → shipped → delivered`. Cancellation possible before `shipped`.
- **Returns**: Customer initiates via account page. Requires order to be `delivered`. Return status: `requested → approved → received → refunded`.
- **Discounts**: Code-based discounts only (no automatic). Codes have type (`percent` or `fixed`), value, min order, usage limit.
- **Guest checkout**: Allowed. Guest orders linked by email; customers can retrospectively claim orders on account creation.

## Current State

Completed and working:
- Product and variant data model + CRUD API
- Collection management (manual curation, ordering)
- Image upload via Cloudinary (direct upload from frontend)
- Basic product listing page with category filters and sorting
- Product detail page with variant selector and add-to-cart
- Cart (local state, persisted to localStorage)
- Checkout flow: address → shipping → payment (Stripe)
- Stripe webhook handler for order confirmation
- Customer auth (register, login, JWT, refresh)
- Order confirmation email via Resend

In progress / not yet built:
- Order management admin panel
- Returns and refund flow
- Discount code system
- Product search (full-text)
- Recommendations ("You may also like")
- Lookbook / editorial pages
- Stock alert emails (low stock, back in stock)
- Customer account order history UI

## When Reviewing or Implementing Tasks, Consider

- Does the change touch inventory? If so, are stock decrements/restores atomic?
- Does the change affect the checkout flow? Test on mobile viewport.
- Does it require a new Stripe webhook event? Register and test with Stripe CLI.
- Does it involve images? Use Cloudinary transformations, not raw URLs.
- Is authentication required? Use the `requireAuth` middleware (admin routes also need `requireAdmin`).
- Is it a new DB migration? Add to `server/src/db/migrations/` — never alter existing migrations.
- Does it produce email notifications? Use the `emailService` wrapper, not Resend directly.
