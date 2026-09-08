import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetSchoolBySlug, useListCourses } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Users,
  GraduationCap,
  CheckCircle2,
  FileText,
  Check,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface ApplicationFormField {
  id: string;
  label: string;
  type: "text" | "paragraph" | "dropdown" | "checkbox" | "date" | "number";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

interface ApplicationFormConfig {
  fields: ApplicationFormField[];
}

const STEPS = [
  { id: 1, label: "Choose Courses" },
  { id: 2, label: "Application Form" },
  { id: 3, label: "Review & Submit" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-9 w-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors",
                step.id < current
                  ? "bg-primary border-primary text-primary-foreground"
                  : step.id === current
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-muted border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {step.id < current ? <Check className="h-4 w-4" /> : step.id}
            </div>
            <span
              className={cn(
                "text-xs mt-1 hidden sm:block font-medium",
                step.id <= current ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={cn(
                "h-0.5 w-12 sm:w-20 mx-2 mb-4 sm:mb-5 transition-colors",
                step.id < current ? "bg-primary" : "bg-muted"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

interface TuitionPlanInfo {
  id: string;
  courseId: string | null;
  amountCents: number;
  allowFullPayment: boolean;
  allowInstallments: boolean;
  installmentCount: number;
}

interface TuitionPaymentResult {
  status: "pending" | "partial" | "paid" | "failed";
  installments: { installmentNumber: number; status: string }[];
}

/**
 * Shows tuition for the courses the applicant selected and lets them try the
 * (currently simulated) payment flow. Purely informational for now -- not a
 * condition for submitting the application. That gate gets turned on later
 * once real payment processing is wired up.
 */
function TuitionSummary({ courseIds, accessToken }: { courseIds: string[]; accessToken: string }) {
  const [plans, setPlans] = useState<TuitionPlanInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [methodByPlan, setMethodByPlan] = useState<Record<string, "full" | "installments">>({});
  const [paymentByPlan, setPaymentByPlan] = useState<Record<string, { id: string; result: TuitionPaymentResult }>>({});
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      courseIds.map((courseId) =>
        fetch(`/api/tuition-plans?courseId=${courseId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    ).then((results) => {
      if (cancelled) return;
      const found = results.flat().filter((p: TuitionPlanInfo) => p.amountCents > 0);
      setPlans(found);
      setMethodByPlan(
        Object.fromEntries(found.map((p: TuitionPlanInfo) => [p.id, p.allowFullPayment ? "full" : "installments"]))
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [courseIds.join(","), accessToken]);

  const handlePay = async (plan: TuitionPlanInfo) => {
    setPayingPlanId(plan.id);
    try {
      const existing = paymentByPlan[plan.id];
      let paymentId = existing?.id;

      if (!paymentId) {
        const res = await fetch("/api/tuition-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ tuitionPlanId: plan.id, paymentMethod: methodByPlan[plan.id] ?? "full" }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to start payment");
        const data = await res.json();
        paymentId = data.id;
      }

      // Try real Stripe checkout first — once STRIPE_SECRET_KEY is set on
      // the server this just starts working with no frontend change; until
      // then it 503s and we fall back to the test-mode simulate-pay path.
      const checkoutRes = await fetch(`/api/tuition-payments/${paymentId}/checkout-session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (checkoutRes.ok) {
        const { url } = await checkoutRes.json();
        if (url) {
          window.location.href = url;
          return;
        }
      }

      const payRes = await fetch(`/api/tuition-payments/${paymentId}/simulate-pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!payRes.ok) throw new Error((await payRes.json().catch(() => ({}))).error || "Payment failed");
      const payData = await payRes.json();

      setPaymentByPlan((prev) => ({ ...prev, [plan.id]: { id: paymentId as string, result: payData } }));
      toast.success(payData.status === "paid" ? "Payment complete (test mode)" : "Installment paid (test mode)");
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setPayingPlanId(null);
    }
  };

  if (loading || plans.length === 0) return null;

  const totalCents = plans.reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tuition & Payment</CardTitle>
        <CardDescription>
          This isn't required to submit your application yet — you can also pay later.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="flex justify-between text-sm font-medium">
          <span>Total tuition</span>
          <span>${(totalCents / 100).toFixed(2)}</span>
        </div>
        {plans.map((plan) => {
          const payment = paymentByPlan[plan.id];
          const isPaidInFull = payment?.result.status === "paid";
          return (
            <div key={plan.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">${(plan.amountCents / 100).toFixed(2)}</span>
                {payment && (
                  <Badge variant={isPaidInFull ? "default" : "outline"} className="text-xs">
                    {isPaidInFull
                      ? "Paid"
                      : `Installment ${payment.result.installments.filter((i) => i.status === "paid").length}/${payment.result.installments.length} paid`}
                  </Badge>
                )}
              </div>
              {!isPaidInFull && (
                <>
                  {plan.allowFullPayment && plan.allowInstallments && (
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={(methodByPlan[plan.id] ?? "full") === "full"}
                          onChange={() => setMethodByPlan((m) => ({ ...m, [plan.id]: "full" }))}
                        />
                        Pay in full
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          checked={methodByPlan[plan.id] === "installments"}
                          onChange={() => setMethodByPlan((m) => ({ ...m, [plan.id]: "installments" }))}
                        />
                        {plan.installmentCount} installments
                      </label>
                    </div>
                  )}
                  <Button size="sm" variant="outline" disabled={payingPlanId === plan.id} onClick={() => handlePay(plan)}>
                    {payingPlanId === plan.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : null}
                    {payment ? "Pay Next Installment (test)" : "Simulate Payment (test)"}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FormFieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ApplicationFormField;
  value: string | string[] | boolean;
  onChange: (val: string | boolean) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <Input
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "paragraph":
      return (
        <Textarea
          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[100px]"
          required={field.required}
        />
      );
    case "dropdown":
      return (
        <Select
          value={(value as string) || ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || "Select an option"} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.id}
            checked={(value as boolean) || false}
            onCheckedChange={(checked) => onChange(!!checked)}
          />
          <label htmlFor={field.id} className="text-sm text-foreground cursor-pointer">
            {field.placeholder || field.label}
          </label>
        </div>
      );
    case "date":
      return (
        <Input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          placeholder={field.placeholder || "0"}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      );
    default:
      return null;
  }
}

export default function SchoolApply() {
  const params = useParams();
  const slug = params.slug || "";
  const [_, setLocation] = useLocation();
  const { user, session } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [formResponses, setFormResponses] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const { data: school, isLoading: isSchoolLoading } = useGetSchoolBySlug(slug, {
    query: { enabled: !!slug },
  });

  const { data: courses, isLoading: isCoursesLoading } = useListCourses(
    { published: true },
    { query: { enabled: !!school?.id } }
  );

  const { data: formConfig, isLoading: isFormLoading } = useQuery<ApplicationFormConfig | null>({
    queryKey: ["application-form", school?.id],
    queryFn: async () => {
      if (!school?.id || !session) return null;
      const res = await fetch(`/api/schools/${school.id}/application-form`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!school?.id,
  });

  const schoolCourses = (courses ?? []).filter((c) => c.schoolId === school?.id);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const handleFieldChange = (fieldId: string, value: string | boolean) => {
    setFormResponses((prev) => ({ ...prev, [fieldId]: value }));
  };

  const canProceedStep1 = selectedCourseIds.length > 0;

  const canProceedStep2 = () => {
    if (!formConfig?.fields) return true;
    return formConfig.fields
      .filter((f) => f.required)
      .every((f) => {
        const val = formResponses[f.id];
        return val !== undefined && val !== "" && val !== false;
      });
  };

  const handleSubmit = async () => {
    if (!school || !user || !session) {
      toast.error("Please log in to submit an application.");
      setLocation("/auth/login");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        schoolId: school.id,
        courseIds: selectedCourseIds,
        formResponses,
        message: message.trim() || undefined,
      };

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to submit application");
      }

      toast.success(`Application submitted to ${school.name}!`);
      setLocation("/dashboard/student");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
    }
  };

  if (isSchoolLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PublicLayout>
    );
  }

  if (!school) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h1 className="text-3xl font-bold mb-4">School not found</h1>
          <p className="text-muted-foreground mb-8">We could not find the school you are looking for.</p>
          <Button asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  if (!(school as any).applicationsOpen) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-32 text-center max-w-lg">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Applications Are Currently Closed</h1>
          <p className="text-muted-foreground mb-8">
            {school.name} is not accepting applications at this time. Check back later or contact the school for more information.
          </p>
          <Button asChild variant="outline">
            <Link href={`/schools/${school.slug}`}>Back to {school.name}</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="mb-6 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link href={`/schools/${school.slug}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {school.name}
          </Link>
        </Button>

        <div className="text-center mb-8">
          {school.logoUrl ? (
            <div className="mx-auto h-16 w-16 rounded-full overflow-hidden border-2 border-muted mb-3">
              <img
                src={school.logoUrl}
                alt={school.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <span className="text-2xl font-bold text-primary">{school.name.charAt(0)}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">Apply to {school.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Complete the steps below to submit your application.
          </p>
        </div>

        <StepIndicator current={step} />

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">Select Courses</h2>
              <p className="text-muted-foreground text-sm">
                Choose one or more courses you would like to enroll in.
              </p>
            </div>

            {isCoursesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : schoolCourses.length === 0 ? (
              <Card className="border-dashed bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="font-medium text-foreground">No Courses Available Yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This school has not published any courses yet. You can still apply and courses
                    will be assigned to you later.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {schoolCourses.map((course) => {
                  const isSelected = selectedCourseIds.includes(course.id);
                  return (
                    <Card
                      key={course.id}
                      className={cn(
                        "cursor-pointer transition-all border-2",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => toggleCourse(course.id)}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div
                          className={cn(
                            "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p className="font-semibold text-foreground">{course.title}</p>
                            {course.code && (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {course.code}
                              </Badge>
                            )}
                          </div>
                          {course.teacherName && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                              <GraduationCap className="h-3.5 w-3.5" />
                              {course.teacherName}
                            </p>
                          )}
                          {course.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {course.description}
                            </p>
                          )}
                        </div>
                        {course.studentCount != null && (
                          <div className="text-right shrink-0 hidden sm:block">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {course.studentCount}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {selectedCourseIds.length > 0 && (
              <p className="text-sm text-primary font-medium">
                {selectedCourseIds.length} course{selectedCourseIds.length !== 1 ? "s" : ""}{" "}
                selected
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1 && schoolCourses.length > 0}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">Application Form</h2>
              <p className="text-muted-foreground text-sm">
                Please fill in the required information below.
              </p>
            </div>

            {isFormLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : formConfig?.fields && formConfig.fields.length > 0 ? (
              <div className="space-y-5">
                {formConfig.fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={field.id} className="text-sm font-medium">
                      {field.label}
                      {field.required && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    <FormFieldRenderer
                      field={field}
                      value={formResponses[field.id] ?? ""}
                      onChange={(v) => handleFieldChange(field.id, v)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Card className="bg-muted/20">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    No specific form fields configured. Please leave a message for the school
                    administrator.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">Message (optional)</Label>
                    <Textarea
                      id="message"
                      placeholder="Introduce yourself or share any relevant information..."
                      className="min-h-[120px]"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {!user && (
              <div className="flex items-start gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-primary">Login Required</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    You must be logged in to submit an application.
                  </p>
                  <div className="flex gap-3 mt-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/auth/login">Log In</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href="/auth/register">Sign Up</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2() || !user}
              >
                Review Application
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">Review Your Application</h2>
              <p className="text-muted-foreground text-sm">
                Please review your application before submitting.
              </p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  School
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="font-medium text-foreground">{school.name}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Selected Courses ({selectedCourseIds.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {selectedCourseIds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No courses selected</p>
                ) : (
                  schoolCourses
                    .filter((c) => selectedCourseIds.includes(c.id))
                    .map((c) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground">{c.title}</span>
                        {c.code && (
                          <Badge variant="outline" className="text-xs">
                            {c.code}
                          </Badge>
                        )}
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {session && selectedCourseIds.length > 0 && (
              <TuitionSummary courseIds={selectedCourseIds} accessToken={session.access_token} />
            )}

            {formConfig?.fields && formConfig.fields.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Application Responses
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {formConfig.fields.map((field) => {
                    const val = formResponses[field.id];
                    return (
                      <div key={field.id}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {field.label}
                        </p>
                        <p className="text-sm text-foreground mt-0.5">
                          {val === undefined || val === ""
                            ? "(not answered)"
                            : typeof val === "boolean"
                            ? val
                              ? "Yes"
                              : "No"
                            : String(val)}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {message && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Your Message</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{message}</p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-muted/20 border-muted">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-foreground">
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              By submitting, you agree to the school&apos;s terms of admission and code of conduct.
            </p>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} size="lg">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Application
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
