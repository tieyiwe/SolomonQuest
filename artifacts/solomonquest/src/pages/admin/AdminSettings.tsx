import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useGetMySchool,
  useUpdateSchool,
  getGetMySchoolQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Settings,
  Loader2,
  Building2,
  Shield,
  FileText,
  Bell,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Info,
  BookCheck,
  User,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ─── apiFetch helper ──────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── Role Permissions Tab ─────────────────────────────────────────────────────

const ROLES = [
  { key: "teacher", label: "Teacher" },
  { key: "student", label: "Student" },
  { key: "staff", label: "Staff" },
] as const;

const FEATURES = [
  { key: "chat", label: "Chat", roles: ["teacher", "student", "staff"] },
  { key: "forum", label: "Forum", roles: ["teacher", "student", "staff"] },
  { key: "quizzes", label: "Quizzes", roles: ["teacher", "student", "staff"] },
  { key: "resources", label: "Resources", roles: ["teacher", "student", "staff"] },
  { key: "video", label: "Video Lessons", roles: ["teacher", "student", "staff"] },
  { key: "assignments", label: "Assignments", roles: ["teacher", "student", "staff"] },
  { key: "announcements", label: "Announcements", roles: ["teacher", "student", "staff"] },
  { key: "grades", label: "Grades", roles: ["teacher", "student", "staff"] },
  { key: "applications", label: "Applications", roles: ["teacher", "student", "staff"] },
  { key: "student_contact_info", label: "View Student Contact Info (email, phone)", roles: ["teacher"] },
  { key: "student_program_info", label: "View Student Program & Courses", roles: ["teacher"] },
  { key: "student_attendance", label: "View Student Attendance", roles: ["teacher"] },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];
type FeatureKey = (typeof FEATURES)[number]["key"];
type PermissionMatrix = Record<RoleKey, Record<FeatureKey, boolean>>;

const DEFAULT_PERMS: PermissionMatrix = {
  teacher: { chat: true, forum: true, quizzes: true, resources: true, video: true, assignments: true, announcements: true, grades: true, applications: true, student_contact_info: false, student_program_info: false, student_attendance: false },
  student: { chat: true, forum: true, quizzes: true, resources: true, video: true, assignments: true, announcements: false, grades: true, applications: false, student_contact_info: false, student_program_info: false, student_attendance: false },
  staff: { chat: false, forum: true, quizzes: false, resources: true, video: false, assignments: false, announcements: true, grades: false, applications: true, student_contact_info: false, student_program_info: false, student_attendance: false },
};

function PermissionsTab({ schoolId }: { schoolId: string | undefined }) {
  const [perms, setPerms] = useState<PermissionMatrix>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<RoleKey>("teacher");

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    apiFetch(`/api/permissions?school_id=${schoolId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") {
          setPerms((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const toggle = useCallback(async (role: RoleKey, feature: FeatureKey) => {
    const newValue = !perms[role]?.[feature];
    setPerms((p) => ({ ...p, [role]: { ...p[role], [feature]: newValue } }));
    const key = `${role}:${feature}`;
    setToggling(key);
    try {
      const res = await apiFetch("/api/permissions", {
        method: "PUT",
        body: JSON.stringify({ school_id: schoolId, role, feature, enabled: newValue }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setPerms((p) => ({ ...p, [role]: { ...p[role], [feature]: !newValue } }));
      toast.error("Failed to update permission");
    } finally {
      setToggling(null);
    }
  }, [perms, schoolId]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm">
        <Info className="h-4 w-4 shrink-0" />
        Changes take effect immediately.
      </div>

      <div className="flex gap-1 border-b pb-0">
        {ROLES.map((role) => (
          <button
            key={role.key}
            onClick={() => setActiveRole(role.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeRole === role.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-gray-700"
            }`}
          >
            {role.label}
          </button>
        ))}
      </div>

      {ROLES.map((role) => (
        <div key={role.key} className={role.key === activeRole ? "" : "hidden"}>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{role.label} Permissions</CardTitle>
              <CardDescription>
                Toggle features available to {role.label.toLowerCase()}s in your school.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {FEATURES.filter((f) => (f.roles as readonly string[]).includes(role.key)).map((f) => (
                    <div key={f.key} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-6 w-10 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y">
                  {FEATURES.filter((feature) => (feature.roles as readonly string[]).includes(role.key)).map((feature) => {
                    const key = `${role.key}:${feature.key}`;
                    const isToggling = toggling === key;
                    return (
                      <div key={feature.key} className="flex items-center justify-between py-3.5">
                        <p className="text-sm font-medium text-gray-800">{feature.label}</p>
                        <div className="flex items-center gap-2">
                          {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={perms[role.key]?.[feature.key] ?? false}
                            onCheckedChange={() => toggle(role.key, feature.key)}
                            disabled={isToggling}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

// ─── Application Form Tab ─────────────────────────────────────────────────────

type FieldType = "text" | "paragraph" | "dropdown" | "checkbox" | "date" | "file" | "number";

interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short Text",
  paragraph: "Paragraph",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  date: "Date",
  file: "File Upload",
  number: "Number",
};

const DEFAULT_FIELDS: FormField[] = [
  { id: "1", label: "Full Name", type: "text", required: true },
  { id: "2", label: "Email Address", type: "text", required: true },
  { id: "3", label: "Why do you want to join?", type: "paragraph", required: true },
];

function ApplicationFormTab({ schoolId }: { schoolId: string | undefined }) {
  const [fields, setFields] = useState<FormField[]>(DEFAULT_FIELDS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    apiFetch(`/api/form-builder/schema?school_id=${schoolId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.fields) && data.fields.length > 0) {
          setFields(data.fields);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const addField = (type: FieldType = "text") => {
    setFields((f) => [
      ...f,
      { id: Date.now().toString(), label: "New Field", type, required: false },
    ]);
  };

  const removeField = (id: string) => setFields((f) => f.filter((field) => field.id !== id));

  const updateField = <K extends keyof FormField>(id: string, key: K, value: FormField[K]) => {
    setFields((f) => f.map((field) => (field.id === id ? { ...field, [key]: value } : field)));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const next = direction === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= fields.length) return;
    setFields((f) => {
      const arr = [...f];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  const updateOptions = (id: string, raw: string) => {
    const options = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    updateField(id, "options", options);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/form-builder/schema", {
        method: "PUT",
        body: JSON.stringify({ school_id: schoolId, fields }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Application form saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Application Form Builder</CardTitle>
              <CardDescription>Configure the fields applicants fill out when applying</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-white px-3 text-sm"
                defaultValue="text"
                id="add-field-type"
              >
                {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => {
                  const sel = document.getElementById("add-field-type") as HTMLSelectElement;
                  addField((sel?.value as FieldType) || "text");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Field
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No fields yet. Choose a type and click "Add Field" to start building your form.
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-start gap-3 p-4 rounded-xl border bg-gray-50/50"
                >
                  <div className="flex flex-col gap-0.5 mt-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-gray-700"
                      onClick={() => moveField(index, "up")}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-gray-700"
                      onClick={() => moveField(index, "down")}
                      disabled={index === fields.length - 1}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Field Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) => updateField(field.id, "label", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Field Type</Label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, "type", e.target.value as FieldType)}
                          className="w-full h-8 rounded-md border border-input bg-white px-2 text-sm"
                        >
                          {(Object.entries(FIELD_TYPE_LABELS) as [FieldType, string][]).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {(field.type === "dropdown" || field.type === "checkbox") && (
                      <div className="space-y-1">
                        <Label className="text-xs">Options (one per line)</Label>
                        <Textarea
                          value={(field.options || []).join("\n")}
                          onChange={(e) => updateOptions(field.id, e.target.value)}
                          placeholder={"Option A\nOption B\nOption C"}
                          rows={3}
                          className="text-sm"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => updateField(field.id, "required", v)}
                        className="scale-75"
                      />
                      <Label className="text-xs text-muted-foreground cursor-pointer">
                        Required field
                      </Label>
                      {field.required && (
                        <Badge className="text-xs bg-red-50 text-red-600 border-red-200 border">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 mt-0.5"
                    onClick={() => removeField(field.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Form
      </Button>
    </div>
  );
}

// ─── AI Agent Tab ──────────────────────────────────────────────────────────────

function AgentTab() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/agent/settings", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
        .then((r) => r.json())
        .then((data) => { if (!cancelled && data.name) setName(data.name); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Agent name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      setName(json.name ?? trimmed);
      toast.success("Agent name updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to save agent name");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-32 w-full max-w-md" />;
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Assistant
        </CardTitle>
        <CardDescription>
          Your school's AI agent helps admins and teachers with questions and can draft reminders or
          announcements. Give it a name your staff will recognize.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Agent Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Solomon"
          />
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── School Settings Tab ──────────────────────────────────────────────────────

function SchoolSettingsTab() {
  const queryClient = useQueryClient();
  const { data: school, isLoading } = useGetMySchool();
  const updateSchool = useUpdateSchool();

  const [form, setForm] = useState({ name: "", logoUrl: "", description: "" });
  const [assignmentRouting, setAssignmentRouting] = useState<"teacher" | "staff" | "admin">("teacher");
  const [assignmentReviewerId, setAssignmentReviewerId] = useState<string>("");
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [routingSaving, setRoutingSaving] = useState(false);

  useEffect(() => {
    if (school) {
      setForm({
        name: school.name || "",
        logoUrl: (school as any).logoUrl || "",
        description: (school as any).description || "",
      });
      const meta = (school as any).assignment_routing;
      if (meta) {
        setAssignmentRouting(meta.mode ?? "teacher");
        setAssignmentReviewerId(meta.reviewer_id ?? "");
      }
    }
  }, [school]);

  useEffect(() => {
    if (!school?.id) return;
    apiFetch(`/api/users?school_id=${school.id}&role=staff`)
      .then((r) => r.json())
      .then((data) => setStaffMembers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [school?.id]);

  const saveRouting = async () => {
    if (!school?.id) return;
    setRoutingSaving(true);
    try {
      await apiFetch(`/api/schools/${school.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_routing: {
            mode: assignmentRouting,
            reviewer_id: assignmentRouting !== "teacher" ? assignmentReviewerId : null,
          },
        }),
      });
      queryClient.invalidateQueries({ queryKey: getGetMySchoolQueryKey() });
      toast.success("Assignment routing saved.");
    } catch {
      toast.error("Failed to save routing settings.");
    } finally {
      setRoutingSaving(false);
    }
  };

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    if (!school) return;
    if (!form.name.trim()) { toast.error("School name is required"); return; }
    updateSchool.mutate(
      {
        id: school.id,
        data: {
          name: form.name,
          logoUrl: form.logoUrl || undefined,
          description: form.description || undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Settings saved");
          queryClient.invalidateQueries({ queryKey: getGetMySchoolQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to save settings"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">School Identity</CardTitle>
          <CardDescription>Basic information about your school</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>School Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Westfield Academy"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Logo URL</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {form.logoUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={form.logoUrl}
                  alt="School logo"
                  className="h-12 w-12 rounded-lg object-contain border bg-gray-50"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <p className="text-xs text-muted-foreground">Logo preview</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="A brief description of your school..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateSchool.isPending}>
        {updateSchool.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save Changes
      </Button>

      {/* Assignment Routing */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookCheck className="h-4 w-4 text-primary" />
            Assignment Submission Routing
          </CardTitle>
          <CardDescription>
            Choose who receives student submissions first. You can optionally assign a staff member or yourself
            to review before it reaches the teacher.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>First Reviewer</Label>
            <Select value={assignmentRouting} onValueChange={(v) => setAssignmentRouting(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Direct to Teacher (default)
                  </div>
                </SelectItem>
                <SelectItem value="staff">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Staff Member (reviews before teacher)
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Admin / Self (you review before teacher)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {assignmentRouting === "staff" && (
            <div className="space-y-1.5">
              <Label>Select Staff Member</Label>
              {staffMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff members found. Add staff first.</p>
              ) : (
                <Select value={assignmentReviewerId} onValueChange={setAssignmentReviewerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffMembers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {assignmentRouting !== "teacher" && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Submissions will be held for review before being visible to the teacher.
              The reviewer will mark submissions as checked to forward them.
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={saveRouting} disabled={routingSaving}>
        {routingSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save Routing
      </Button>
    </div>
  );
}

// ─── Reminders Tab ────────────────────────────────────────────────────────────

interface Reminder {
  id: string;
  target_user_id: string;
  message: string;
  send_at: string;
  type: string;
}

function RemindersTab({ schoolId }: { schoolId: string | undefined }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    target_user_id: "",
    message: "",
    send_before_hours: "24",
    class_date: "",
  });

  // Load reminders
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    apiFetch(`/api/reminders?school_id=${schoolId}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setReminders(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const setF = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleAdd = async () => {
    if (!form.target_user_id.trim()) { toast.error("Teacher is required"); return; }
    if (!form.message.trim()) { toast.error("Message is required"); return; }
    if (!form.class_date) { toast.error("Class date is required"); return; }

    const classDate = new Date(form.class_date);
    const sendAt = new Date(classDate.getTime() - Number(form.send_before_hours) * 60 * 60 * 1000);

    setSending(true);
    try {
      const res = await apiFetch("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          school_id: schoolId,
          target_user_id: form.target_user_id.trim(),
          message: form.message.trim(),
          send_at: sendAt.toISOString(),
          type: "admin_to_teacher",
        }),
      });
      if (!res.ok) throw new Error("Failed to schedule reminder");
      const created = await res.json();
      setReminders((r) => [created, ...r]);
      setForm({ target_user_id: "", message: "", send_before_hours: "24", class_date: "" });
      toast.success("Reminder scheduled");
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule reminder");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Schedule a Reminder</CardTitle>
          <CardDescription>Send a reminder to a teacher before their class</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Teacher (user ID or email)</Label>
            <Input
              value={form.target_user_id}
              onChange={(e) => setF("target_user_id", e.target.value)}
              placeholder="teacher@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea
              value={form.message}
              onChange={(e) => setF("message", e.target.value)}
              placeholder="Your class is coming up soon..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Class Date &amp; Time</Label>
              <Input
                type="datetime-local"
                value={form.class_date}
                onChange={(e) => setF("class_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Send Before (hours)</Label>
              <Input
                type="number"
                min="1"
                value={form.send_before_hours}
                onChange={(e) => setF("send_before_hours", e.target.value)}
                placeholder="24"
              />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={sending} className="w-full">
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bell className="mr-2 h-4 w-4" />
            )}
            Schedule Reminder
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Scheduled Reminders</h3>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm border rounded-xl">
            No reminders scheduled yet.
          </div>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between p-4 rounded-xl border bg-gray-50/50"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-gray-800">{r.message}</p>
                  <p className="text-xs text-muted-foreground">To: {r.target_user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Send at:{" "}
                    {new Date(r.send_at).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {r.type}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminSettings() {
  const { data: school } = useGetMySchool();
  const schoolId = school?.id;

  return (
    <AdminLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/admin">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-muted-foreground mt-0.5">
            Configure your school's settings, permissions, application form, and reminders.
          </p>
        </div>

        <Tabs defaultValue="permissions">
          <TabsList className="border-b rounded-none bg-transparent p-0 h-auto gap-0">
            {[
              { value: "permissions", label: "Role Permissions", icon: Shield },
              { value: "form", label: "Application Form", icon: FileText },
              { value: "school", label: "School Settings", icon: Building2 },
              { value: "reminders", label: "Reminders", icon: Bell },
              { value: "agent", label: "AI Assistant", icon: Sparkles },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-medium"
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="permissions" className="mt-6">
            <PermissionsTab schoolId={schoolId} />
          </TabsContent>
          <TabsContent value="form" className="mt-6">
            <ApplicationFormTab schoolId={schoolId} />
          </TabsContent>
          <TabsContent value="school" className="mt-6">
            <SchoolSettingsTab />
          </TabsContent>
          <TabsContent value="reminders" className="mt-6">
            <RemindersTab schoolId={schoolId} />
          </TabsContent>
          <TabsContent value="agent" className="mt-6">
            <AgentTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
