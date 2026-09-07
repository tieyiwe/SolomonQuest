import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Bell,
  Mail,
  MessageSquare,
  BookOpen,
  Star,
  FileText,
  Users,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

async function apiFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers ?? {}),
    },
  });
}

// ---- types ----

interface NotificationPrefs {
  inApp: boolean;
  email: boolean;
  chatMessages: boolean;
  forumActivity: boolean;
  assignmentUpdates: boolean;
  gradeNotifications: boolean;
  newResources: boolean;
  applicationStatusUpdates: boolean;
}

const defaultPrefs: NotificationPrefs = {
  inApp: true,
  email: true,
  chatMessages: true,
  forumActivity: true,
  assignmentUpdates: true,
  gradeNotifications: true,
  newResources: true,
  applicationStatusUpdates: true,
};

// ---- PreferenceRow ----

interface PreferenceRowProps {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function PreferenceRow({
  id,
  label,
  description,
  icon,
  checked,
  disabled,
  onToggle,
}: PreferenceRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
        <div>
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onToggle} disabled={disabled} />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3 flex-1">
        <Skeleton className="h-4 w-4 mt-0.5 shrink-0 rounded" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Skeleton className="h-6 w-11 rounded-full shrink-0" />
    </div>
  );
}

// ---- Main Component ----

export default function NotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch("/api/users/me/notification-prefs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setPrefs({ ...defaultPrefs, ...data });
      })
      .catch(() => {
        toast.error("Could not load notification preferences.");
      })
      .finally(() => setLoading(false));
  }, []);

  const savePrefs = async (updated: NotificationPrefs) => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/users/me/notification-prefs", {
        method: "PUT",
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error();
      toast.success("Preferences saved");
    } catch {
      toast.error("Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      // Debounce saves to avoid flooding the API on rapid toggles
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => savePrefs(updated), 300);
      return updated;
    });
  };

  const deliveryItems: {
    id: keyof NotificationPrefs;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "inApp",
      label: "In-App Notifications",
      description: "Receive notifications inside the app.",
      icon: <Bell className="h-4 w-4" />,
    },
    {
      id: "email",
      label: "Email Notifications",
      description: "Receive notifications via email.",
      icon: <Mail className="h-4 w-4" />,
    },
  ];

  const activityItems: {
    id: keyof NotificationPrefs;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: "chatMessages",
      label: "Chat Messages",
      description: "Notifications for new direct and channel messages.",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: "forumActivity",
      label: "Forum Activity",
      description: "Comments and reactions on forum posts.",
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "assignmentUpdates",
      label: "Assignments",
      description: "Notifications about assignment changes and deadlines.",
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: "gradeNotifications",
      label: "Grades",
      description: "Alerts when grades or feedback are posted.",
      icon: <Star className="h-4 w-4" />,
    },
    {
      id: "newResources",
      label: "Resources",
      description: "Notifications when new learning resources are added.",
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      id: "applicationStatusUpdates",
      label: "Applications",
      description: "Updates on the status of your applications.",
      icon: <Layers className="h-4 w-4" />,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Preferences</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Control how and when you receive notifications.
          {saving && <span className="ml-2 text-primary">Saving...</span>}
        </p>
      </div>

      {/* Delivery Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Delivery
          </CardTitle>
          <CardDescription>Choose how you want to receive notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <RowSkeleton />
              <div className="border-t" />
              <RowSkeleton />
            </>
          ) : (
            deliveryItems.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <div className="border-t" />}
                <div className={i > 0 ? "pt-4" : ""}>
                  <PreferenceRow
                    id={item.id}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    checked={prefs[item.id]}
                    disabled={saving}
                    onToggle={() => toggle(item.id)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Notify me about Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Notify Me About
          </CardTitle>
          <CardDescription>Select which types of activity should trigger notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  {i > 0 && <div className="border-t" />}
                  <div className={i > 0 ? "pt-4" : ""}>
                    <RowSkeleton />
                  </div>
                </div>
              ))}
            </>
          ) : (
            activityItems.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <div className="border-t" />}
                <div className={i > 0 ? "pt-4" : ""}>
                  <PreferenceRow
                    id={item.id}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    checked={prefs[item.id]}
                    disabled={saving}
                    onToggle={() => toggle(item.id)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
