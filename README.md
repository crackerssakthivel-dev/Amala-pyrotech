# AMALA PYROTECH — Supabase Backend Edition

This package keeps the supplied HTML/CSS/page structure and replaces browser-only persistence with Supabase database + Storage.

## Files
- `index.html` — customer Home page
- `catalog.html` — catalog + checkout
- `track-order.html` — live order status lookup
- `admin-panel.html` — existing Admin UI connected to Supabase
- `admin-login.html` — Supabase Auth login for Admin
- `supabase-config.js` — paste your Supabase project URL + anon key here
- `supabase-client.js` — shared client/storage helpers
- `schema.sql` — database, RLS, Storage bucket and secure checkout/track RPCs
- `*-backend.js` — backend wiring only; the visual HTML/CSS remains in the supplied pages

## Supabase setup
1. Create a Supabase project.
2. Open SQL Editor and run the complete `schema.sql`.
3. In Authentication -> Users, create the admin email/password account.
4. Put the project URL and **anon public key** in `supabase-config.js`.
5. Never put a `service_role` key in the website.
6. Deploy the folder to GitHub/Vercel.

## Media uploads
Admin image uploads go to the `site-media` Supabase Storage bucket. No image is stored in localStorage or as a browser data URL.

## Immutable invoice
At first checkout, the exact customer details, product code/name/pack, MRP, offer price, quantity, subtotals, totals, Order ID and date are stored in `orders.invoice_snapshot`. Later product edits do not change that snapshot. Both customer checkout and Admin invoice download use the stored snapshot.

## Customer deduplication
The `customers.mobile` field is globally unique. The checkout RPC upserts the customer by mobile number, so repeat orders reuse the same customer record while every order remains separate.

## Important security note
The public checkout/track operations use narrowly scoped database functions. Catalog/settings are public-read. Admin writes require an authenticated Supabase user. Review/tighten RLS policies before high-volume production use.
