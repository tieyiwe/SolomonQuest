-- Run in the Supabase SQL editor.
--
-- Adds the columns needed to reconcile Stripe Checkout Sessions/PaymentIntents
-- against tuition_payments/tuition_installments. Nothing here requires Stripe
-- to actually be connected yet — these columns just sit null until it is.

alter table public.tuition_payments
  add column if not exists stripe_customer_id text;

alter table public.tuition_installments
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text;

create index if not exists tuition_installments_stripe_session_idx
  on public.tuition_installments (stripe_checkout_session_id);
