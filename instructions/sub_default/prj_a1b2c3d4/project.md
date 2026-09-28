---
capabilities: perm_coding,perm_coding_tester,perm_test_regression,perm_frontend,perm_backend,perm_ux,perm_architect,perm_migrate,perm_code_reader
---

---
capabilities: perm_coding,perm_coding_tester,perm_test_regression,perm_frontend,perm_backend,perm_ux,perm_architect,perm_migrate,perm_code_reader
---

# Project Context — Velour E-Commerce Platform

**Sector:** Fashion E-Commerce
**Type of project:** Custom e-commerce website — a software development project building an online store from scratch
**Language on this board:** features, pages, checkout, orders, products, customers, admin panel. Not physical deliverables, documents, or offline processes.

This file gives all agents background knowledge about the project — what it's for and the rules it has to follow. It deliberately says nothing about the current code: the stack, structure, and what is already built are whatever the linked folder actually contains, so read the code to find out. If a task assumes something the code doesn't have, say so rather than guessing.

## What Are We Building?

A bespoke e-commerce platform for **Velour**, a fashion brand selling clothing and accessories. The platform replaces a third-party hosted store with a fully custom solution the team owns end-to-end.

Modules the platform is meant to cover over time:
- **Product catalogue** — listings, variants (size/colour), media, stock levels
- **Collections** — editorial groupings (e.g. "Summer Edit", "Bestsellers", "New In")
- **Customer accounts** — registration, login, order history, saved addresses
- **Shopping cart + checkout** — guest and authenticated, payments, address validation
- **Order management** — status tracking, fulfilment workflow, returns/refunds
- **Admin panel** — product management, order processing, stock updates, discount codes
- **Content** — lookbook/editorial pages, homepage hero, homepage featured collections

## Coding Conventions *(for developers and testers only — do not reference these in client conversations)*

- Match the style and patterns already in the codebase
- Keep changes small and focused on the task

## Key Domain Rules *(for developers and testers only — do not reference these in client conversations)*

These apply once the relevant module exists. Until then, work with what the code has and flag the gap instead of inventing structure.

- **Inventory**: Stock is tracked per variant (product + size + colour combination). Decrement on order placement, restore on cancellation/return.
- **Pricing**: Base price on product, optional sale price.
- **Variants**: A product always has at least one variant holding `sku`, `stock`, `size`, `colour`.
- **Orders**: Status flow: `pending → confirmed → processing → shipped → delivered`. Cancellation possible before `shipped`.
- **Returns**: Customer initiates via account page. Requires order to be `delivered`. Return status: `requested → approved → received → refunded`.
- **Discounts**: Code-based discounts only (no automatic). Codes have type (`percent` or `fixed`), value, min order, usage limit.
- **Guest checkout**: Allowed. Guest orders linked by email; customers can retrospectively claim orders on account creation.

## When Reviewing or Implementing Tasks, Consider

- Does the task assume something the code doesn't have yet? Say so and ask how to proceed instead of guessing.
- Does the change touch inventory or the cart? Stock and cart contents must stay accurate — overselling is a critical failure.
- Does it look right on mobile? Most traffic is mobile.
- Is it on-brand — clean, minimal, editorial?
