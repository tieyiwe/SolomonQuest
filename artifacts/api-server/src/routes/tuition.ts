import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getStripe, isStripeConfigured } from "../lib/stripe";

const router: IRouter = Router();

function canManageTuition(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin" || role === "teacher";
}

function mapPlan(p: Record<string, unknown>) {
  return {
    id: p.id,
    schoolId: p.school_id,
    courseId: p.course_id,
    programId: p.program_id,
    amountCents: p.amount_cents,
    currency: p.currency,
    allowFullPayment: p.allow_full_payment,
    allowInstallments: p.allow_installments,
    installmentCount: p.installment_count,
    createdAt: p.created_at,
  };
}

// ─── GET /tuition-plans?courseId=&programId= ─────────────────────────────────
router.get("/tuition-plans", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { courseId, programId } = req.query as { courseId?: string; programId?: string };

  let query = supabaseAdmin.from("tuition_plans").select("*").eq("school_id", req.schoolId ?? "");
  if (courseId) query = query.eq("course_id", courseId);
  if (programId) query = query.eq("program_id", programId);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json((data ?? []).map(mapPlan));
});

// ─── POST /tuition-plans — create or update the plan for a course/program ───
router.post("/tuition-plans", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageTuition(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { courseId, programId, amountCents, allowFullPayment, allowInstallments, installmentCount } = req.body as {
    courseId?: string;
    programId?: string;
    amountCents?: number;
    allowFullPayment?: boolean;
    allowInstallments?: boolean;
    installmentCount?: number;
  };

  if ((!courseId && !programId) || (courseId && programId)) {
    res.status(400).json({ error: "Provide exactly one of courseId or programId" });
    return;
  }
  if (amountCents === undefined || amountCents < 0) {
    res.status(400).json({ error: "amountCents is required and must be >= 0" });
    return;
  }
  if (!allowFullPayment && !allowInstallments) {
    res.status(400).json({ error: "At least one payment option (full or installments) must be enabled" });
    return;
  }

  const scopeColumn = courseId ? "course_id" : "program_id";
  const scopeId = courseId ?? programId;

  // Verify the course/program actually belongs to the caller's own school —
  // otherwise a caller could target another school's course/program id
  // (discoverable via the public GET /courses/public endpoint) and hijack
  // or overwrite that school's tuition plan.
  const { data: scopeRow } = await supabaseAdmin
    .from(courseId ? "courses" : "programs")
    .select("school_id")
    .eq("id", scopeId as string)
    .maybeSingle();

  if (!scopeRow || scopeRow.school_id !== req.schoolId) {
    res.status(404).json({ error: courseId ? "Course not found" : "Program not found" });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("tuition_plans")
    .select("id")
    .eq(scopeColumn, scopeId as string)
    .eq("school_id", req.schoolId ?? "")
    .maybeSingle();

  const row = {
    school_id: req.schoolId,
    course_id: courseId ?? null,
    program_id: programId ?? null,
    amount_cents: amountCents,
    allow_full_payment: allowFullPayment ?? true,
    allow_installments: allowInstallments ?? false,
    installment_count: allowInstallments ? Math.max(2, installmentCount ?? 2) : 1,
    created_by: req.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existing
    ? await supabaseAdmin
        .from("tuition_plans")
        .update(row)
        .eq("id", existing.id)
        .eq("school_id", req.schoolId ?? "")
        .select()
        .single()
    : await supabaseAdmin.from("tuition_plans").insert(row).select().single();

  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to save tuition plan" });
    return;
  }

  res.status(201).json(mapPlan(data));
});

// ─── DELETE /tuition-plans/:id ────────────────────────────────────────────────
router.delete("/tuition-plans/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageTuition(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error, count } = await supabaseAdmin
    .from("tuition_plans")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("school_id", req.schoolId ?? "");
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!count) {
    res.status(404).json({ error: "Tuition plan not found" });
    return;
  }
  res.sendStatus(204);
});

function mapPayment(p: Record<string, unknown>, installments: Record<string, unknown>[]) {
  return {
    id: p.id,
    studentId: p.student_id,
    tuitionPlanId: p.tuition_plan_id,
    courseId: p.course_id,
    programId: p.program_id,
    amountCents: p.amount_cents,
    currency: p.currency,
    paymentMethod: p.payment_method,
    installmentCount: p.installment_count,
    status: p.status,
    provider: p.provider,
    createdAt: p.created_at,
    installments: installments.map((i) => ({
      id: i.id,
      installmentNumber: i.installment_number,
      amountCents: i.amount_cents,
      dueDate: i.due_date,
      status: i.status,
      paidAt: i.paid_at,
    })),
  };
}

// ─── POST /tuition-payments — student starts a payment for a plan ───────────
// Not enforced anywhere yet (doesn't gate enrollment/applications) -- this
// only records intent so the flow can be tested end-to-end before a real
// payment processor and the "must pay to enroll" condition are turned on.
router.post("/tuition-payments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { tuitionPlanId, paymentMethod } = req.body as { tuitionPlanId?: string; paymentMethod?: "full" | "installments" };

  if (!tuitionPlanId || (paymentMethod !== "full" && paymentMethod !== "installments")) {
    res.status(400).json({ error: "tuitionPlanId and paymentMethod ('full' or 'installments') are required" });
    return;
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from("tuition_plans")
    .select("*")
    .eq("id", tuitionPlanId)
    .single();

  if (planError || !plan) {
    res.status(404).json({ error: "Tuition plan not found" });
    return;
  }
  if (paymentMethod === "full" && !plan.allow_full_payment) {
    res.status(400).json({ error: "Full payment is not offered for this plan" });
    return;
  }
  if (paymentMethod === "installments" && !plan.allow_installments) {
    res.status(400).json({ error: "Installment payment is not offered for this plan" });
    return;
  }

  const installmentCount = paymentMethod === "installments" ? plan.installment_count : 1;

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("tuition_payments")
    .insert({
      school_id: plan.school_id,
      student_id: req.userId,
      tuition_plan_id: plan.id,
      course_id: plan.course_id,
      program_id: plan.program_id,
      amount_cents: plan.amount_cents,
      currency: plan.currency,
      payment_method: paymentMethod,
      installment_count: installmentCount,
      status: "pending",
      provider: "manual",
    })
    .select()
    .single();

  if (paymentError || !payment) {
    res.status(400).json({ error: paymentError?.message ?? "Failed to start payment" });
    return;
  }

  // Split the total evenly across installments (remainder goes on the last
  // one so cents always add up), due monthly starting today.
  const base = Math.floor(plan.amount_cents / installmentCount);
  const remainder = plan.amount_cents - base * installmentCount;
  const now = new Date();
  const installmentRows = Array.from({ length: installmentCount }, (_, i) => {
    const dueDate = new Date(now.getFullYear(), now.getMonth() + i, now.getDate());
    return {
      payment_id: payment.id,
      installment_number: i + 1,
      amount_cents: base + (i === installmentCount - 1 ? remainder : 0),
      due_date: dueDate.toISOString().slice(0, 10),
      status: "pending",
    };
  });

  const { data: installments, error: installmentsError } = await supabaseAdmin
    .from("tuition_installments")
    .insert(installmentRows)
    .select();

  if (installmentsError) {
    res.status(400).json({ error: installmentsError.message });
    return;
  }

  res.status(201).json(mapPayment(payment, installments ?? []));
});

// ─── POST /tuition-payments/:id/simulate-pay — test-only stub ───────────────
// Marks the next unpaid installment (or the whole payment, for "full") as
// paid without any real money moving. Stands in until a real processor is
// wired up so the checkout UX can be built and tested now.
router.post(
  "/tuition-payments/:id/simulate-pay",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("tuition_payments")
      .select("*")
      .eq("id", id)
      .single();

    if (paymentError || !payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const isOwnPayment = payment.student_id === req.userId;
    const isSchoolStaff = canManageTuition(req.userRole) && payment.school_id === req.schoolId;
    if (!isOwnPayment && !isSchoolStaff) {
      res.status(403).json({ error: "Not authorized to modify this payment" });
      return;
    }

    const { data: installments, error: instError } = await supabaseAdmin
      .from("tuition_installments")
      .select("*")
      .eq("payment_id", id)
      .order("installment_number", { ascending: true });

    if (instError) {
      res.status(500).json({ error: instError.message });
      return;
    }

    const nextUnpaid = (installments ?? []).find((i) => i.status !== "paid");
    if (!nextUnpaid) {
      res.status(400).json({ error: "Already fully paid" });
      return;
    }

    await supabaseAdmin
      .from("tuition_installments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", nextUnpaid.id);

    const allPaid = (installments ?? []).every((i) => i.id === nextUnpaid.id || i.status === "paid");
    const newStatus = allPaid ? "paid" : "partial";

    const { data: updatedPayment, error: updateError } = await supabaseAdmin
      .from("tuition_payments")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !updatedPayment) {
      res.status(500).json({ error: updateError?.message ?? "Failed to update payment" });
      return;
    }

    const { data: refreshedInstallments } = await supabaseAdmin
      .from("tuition_installments")
      .select("*")
      .eq("payment_id", id)
      .order("installment_number", { ascending: true });

    res.json(mapPayment(updatedPayment, refreshedInstallments ?? []));
  }
);

// ─── POST /tuition-payments/:id/checkout-session — real Stripe checkout ────
// Creates a Stripe Checkout Session for the next unpaid installment (or the
// full amount, for a one-shot payment) and returns its URL for the client
// to redirect to. The actual "mark as paid" happens in the webhook handler
// once Stripe confirms the payment — this route only starts the session.
// Returns 503 with a clear message if Stripe isn't connected yet, so the
// frontend can fall back to (or just disable) real checkout until it is,
// without the rest of tuition ever breaking.
router.post(
  "/tuition-payments/:id/checkout-session",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Online payment isn't connected yet. Contact your school administrator." });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("tuition_payments")
      .select("*")
      .eq("id", id)
      .single();

    if (paymentError || !payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    // Only the student who owns this payment can start a checkout for it —
    // unlike simulate-pay, school staff never need to pay on a student's
    // behalf through Stripe.
    if (payment.student_id !== req.userId) {
      res.status(403).json({ error: "Not authorized to pay this" });
      return;
    }

    const { data: installments, error: instError } = await supabaseAdmin
      .from("tuition_installments")
      .select("*")
      .eq("payment_id", id)
      .order("installment_number", { ascending: true });

    if (instError) {
      res.status(500).json({ error: instError.message });
      return;
    }

    const nextUnpaid = (installments ?? []).find((i) => i.status !== "paid");
    if (!nextUnpaid) {
      res.status(400).json({ error: "Already fully paid" });
      return;
    }

    const appUrl = process.env.APP_URL ?? "";

    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: (payment.currency as string) ?? "usd",
              product_data: {
                name:
                  payment.payment_method === "installments"
                    ? `Tuition installment ${nextUnpaid.installment_number} of ${payment.installment_count}`
                    : "Tuition payment",
              },
              unit_amount: nextUnpaid.amount_cents as number,
            },
            quantity: 1,
          },
        ],
        client_reference_id: nextUnpaid.id as string,
        metadata: {
          tuition_payment_id: payment.id as string,
          tuition_installment_id: nextUnpaid.id as string,
        },
        success_url: `${appUrl}/dashboard/student/tuition?checkout=success`,
        cancel_url: `${appUrl}/dashboard/student/tuition?checkout=cancelled`,
      });

      await supabaseAdmin
        .from("tuition_installments")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", nextUnpaid.id);

      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to start checkout" });
    }
  }
);

// ─── GET /tuition-payments/me ─────────────────────────────────────────────────
router.get("/tuition-payments/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: payments, error } = await supabaseAdmin
    .from("tuition_payments")
    .select("*")
    .eq("student_id", req.userId ?? "")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const enriched = await Promise.all(
    (payments ?? []).map(async (p) => {
      const { data: installments } = await supabaseAdmin
        .from("tuition_installments")
        .select("*")
        .eq("payment_id", p.id)
        .order("installment_number", { ascending: true });
      return mapPayment(p, installments ?? []);
    })
  );

  res.json(enriched);
});

// ─── GET /tuition-payments — school-wide list (admin/teacher) ───────────────
router.get("/tuition-payments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!canManageTuition(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data: payments, error } = await supabaseAdmin
    .from("tuition_payments")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const studentIds = Array.from(new Set((payments ?? []).map((p) => p.student_id as string)));
  const { data: students } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] as Record<string, unknown>[] };
  const studentNameById = new Map((students ?? []).map((s) => [s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim()]));

  res.json(
    (payments ?? []).map((p) => ({
      id: p.id,
      studentId: p.student_id,
      studentName: studentNameById.get(p.student_id as string) ?? "Unknown",
      courseId: p.course_id,
      programId: p.program_id,
      amountCents: p.amount_cents,
      paymentMethod: p.payment_method,
      installmentCount: p.installment_count,
      status: p.status,
      createdAt: p.created_at,
    }))
  );
});

export default router;
