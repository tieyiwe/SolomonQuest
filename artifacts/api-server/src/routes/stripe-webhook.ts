import { Router, type IRouter } from "express";
import express from "express";
import type Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Mounted in app.ts BEFORE express.json() — Stripe's signature verification
// needs the exact raw request bytes, and a JSON-parsed-then-restringified
// body will not match the signature Stripe sent.
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not connected" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "Missing Stripe-Signature header" });
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, signature, getStripeWebhookSecret());
    } catch (err: any) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: `Webhook signature verification failed: ${err?.message}` });
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const installmentId = session.metadata?.tuition_installment_id;
        const paymentId = session.metadata?.tuition_payment_id;

        if (installmentId && paymentId) {
          await supabaseAdmin
            .from("tuition_installments")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id:
                typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
            })
            .eq("id", installmentId);

          const { data: installments } = await supabaseAdmin
            .from("tuition_installments")
            .select("status")
            .eq("payment_id", paymentId);

          const allPaid = (installments ?? []).every((i) => i.status === "paid");

          await supabaseAdmin
            .from("tuition_payments")
            .update({
              status: allPaid ? "paid" : "partial",
              provider: "stripe",
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);

          logger.info({ paymentId, installmentId }, "Stripe tuition payment recorded");
        } else {
          logger.warn({ sessionId: session.id }, "Stripe checkout.session.completed missing tuition metadata");
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Error handling Stripe webhook");
      res.status(500).json({ error: "Webhook handler error" });
    }
  }
);

export default router;
