import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { SignUp, useUser } from "@clerk/clerk-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface InviteDetails {
  email: string;
  role: string;
  schoolName: string;
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invitations/accept/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setInviteError(data.error);
        else setInvite(data);
      })
      .catch(() => setInviteError("Failed to load invitation"))
      .finally(() => setLoading(false));
  }, [token]);

  // Once Clerk finishes sign-up (using the invite's email, pre-filled
  // below), apply the invitation's role + school to the new profile.
  useEffect(() => {
    if (!isSignedIn || !invite || accepting || success) return;
    setAccepting(true);
    (async () => {
      try {
        const clerk = (window as any).Clerk;
        const clerkToken = await clerk?.session?.getToken();
        const res = await fetch(`/api/invitations/accept/${token}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${clerkToken}` },
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to accept invitation");

        setSuccess(true);
        toast.success("Account created! Welcome to " + invite.schoolName);

        setTimeout(() => {
          const role = invite.role;
          if (role === "teacher") setLocation("/dashboard/teacher");
          else if (role === "staff" || role === "student") setLocation("/dashboard/student");
          else if (role === "admin" || role === "super_admin") setLocation("/dashboard/admin");
          else setLocation("/dashboard/student");
        }, 1500);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
        setAccepting(false);
      }
    })();
  }, [isSignedIn, invite]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Invitation Invalid</CardTitle>
            <CardDescription>{inviteError}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Please contact your school administrator for a new invitation.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success || accepting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {success ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <CardTitle>Welcome aboard!</CardTitle>
                <CardDescription>Taking you to your dashboard...</CardDescription>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <CardTitle>Setting up your account...</CardTitle>
              </>
            )}
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-3">
            <Badge variant="secondary" className="text-sm capitalize">{invite?.role}</Badge>
          </div>
          <CardTitle className="text-2xl">You're invited!</CardTitle>
          <CardDescription>
            Join <span className="font-semibold text-foreground">{invite?.schoolName}</span> on SolomonQuest
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUp
            routing="virtual"
            initialValues={{ emailAddress: invite?.email }}
            appearance={{ elements: { rootBox: "w-full", card: "shadow-none p-0 w-full" } }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
