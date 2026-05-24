# Client Context — TGH Iron & Steel

This file describes the client, their business, and what they care about. Agents should use this when planning tasks to ensure work aligns with business goals and operational requirements.

## About the Client

**TGH Iron & Steel** is a mid-sized industrial manufacturer and distributor specialising in structural steel, iron castings, and custom metal fabrication for the construction and engineering sectors.

The business provides:
- **Structural steel**: beams, columns, channels, and plates for commercial and residential construction
- **Iron castings**: custom and standard components for heavy machinery and infrastructure
- **Metal fabrication**: cut-to-size, welding, drilling, and surface treatment services
- **Distribution**: wholesale supply to contractors, engineers, and regional distributors

The business is B2B-focused with two production facilities and a national distribution network.

## Platform Goal

TGH is replacing a legacy quoting and order management system with a modern web platform. The new platform will:
1. Let customers request and track quotes online with full specification detail
2. Allow the internal team to process orders, manage production stages, and coordinate delivery
3. Give sales reps a CRM-adjacent view of client accounts and quote history
4. Integrate with their inventory system for near-real-time stock of raw materials and finished goods

## Client Priorities (in order)

1. **Quote accuracy** — incorrect quotes cause margin erosion and customer trust failures
2. **Order visibility** — customers and internal teams must always know where an order stands
3. **Integration reliability** — inventory sync must be near-real-time; stale stock causes broken promises
4. **Audit trail** — all quote changes and order modifications must be logged (ISO 9001 requirement)
5. **Simplicity for field users** — sales reps and plant operators are not technical; the UI must be obvious

## Target Users

**External (Customers):**
- Procurement managers at construction firms
- Project engineers ordering to spec
- Distributor buyers placing high-volume repeat orders

**Internal:**
- Sales reps processing quotes and following up on opportunities
- Operations staff tracking production progress and logistics
- Finance team handling invoicing and credit limits

## Communication Style

- Formal and precise — this is a B2B industrial context; avoid casual language
- Technical detail is welcome; this is an engineering audience
- Compliance and audit context always matters ("this must be logged because ISO 9001")
- Prefer concrete examples over abstract principles

## What the Client Considers Done

A feature is "done" when:
- It handles edge cases typical in industrial ordering (partial shipments, spec changes mid-order, credit holds)
- It has an audit log entry for every state change
- Internal and external views are correctly separated (customers cannot see cost prices or margin data)
- It works reliably on desktop (back-office tool; mobile is secondary)

## Things to Avoid

- Rounding cost or margin data — precision matters in industrial pricing
- Removing audit log fields — even if they look unnecessary, they may be compliance-required
- Exposing internal pricing or margin data in customer-facing views
- Skipping validation on numeric inputs — incorrect weights or dimensions cost real money
- Over-building before validation — ship small, iterate based on ops team feedback
