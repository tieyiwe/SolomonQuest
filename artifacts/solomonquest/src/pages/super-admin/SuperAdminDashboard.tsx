import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Building2,
  Users,
  BookOpen,
  AlertTriangle,
  Settings,
  Archive,
  FileText,
  Shield,
  TrendingUp,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  DollarSign,
  ToggleLeft,
} from "lucide-react";

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

type Section =
  | "dashboard"
  | "analytics"
  | "schools"
  | "users"
  | "deletion-requests"
  | "domain-requests"
  | "subscriptions"
  | "archive"
  | "audit-log"
  | "platform-settings"
  | "profile";

interface DashboardData {
  totalSchools: number;
  totalUsers: number;
  activeCourses: number;
  pendingDeletions: number;
  newSchoolsThisMonth: number;
  newUsersThisMonth: number;
  activeSchools: number;
  archivedSchools: number;
  recentSignups: Array<{
    id: string;
    name: string;
    role: string;
    school: string;
    joined: string;
  }>;
}

interface AnalyticsData {
  schoolsGrowth: Array<{ month: string; count: number }>;
  usersGrowth: Array<{
    month: string;
    students: number;
    teachers: number;
    admins: number;
  }>;
  topSchools: Array<{ name: string; students: number }>;
  applicationStats: { approved: number; rejected: number; pending: number };
}

interface School {
  id: string;
  name: string;
  owner: string;
  students: number;
  teachers: number;
  courses: number;
  status: "active" | "inactive";
  created: string;
  details?: Record<string, unknown>;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  school: string;
  joined: string;
  suspended: boolean;
}

interface DeletionRequest {
  id: string;
  schoolId: string;
  school: string;
  requester: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  reviewNotes?: string;
}

interface SubscriptionSchool {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "basic" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled";
  billing_amount_cents: number;
  trial_ends_at: string | null;
  created_at: string;
}

interface SubscriptionsSummary {
  mrr_cents: number;
  total_schools: number;
  by_plan: Record<string, number>;
  by_status: Record<string, number>;
}

interface DomainRequest {
  schoolId: string;
  schoolName: string;
  slug: string;
  domain: string;
  status: "requested" | "approved" | "verified" | "failed";
  requestedAt: string | null;
}

interface ArchiveEntry {
  id: string;
  schoolId: string;
  schoolName: string;
  deletedAt: string;
  daysRemaining: number;
  expired: boolean;
}

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

interface PlatformSettings {
  maxSchoolsPerAdmin: number;
  maxStudentsPerSchool: number;
  maxCoursesPerSchool: number;
  allowSchoolRegistration: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-700 text-red-100",
  admin: "bg-blue-700 text-blue-100",
  teacher: "bg-green-700 text-green-100",
  student: "bg-purple-700 text-purple-100",
};

const ACTION_COLORS: Record<string, string> = {
  school_deleted: "text-red-400",
  school_restored: "text-green-400",
  user_suspended: "text-orange-400",
  user_deleted: "text-red-400",
  settings_updated: "text-blue-400",
  school_created: "text-green-400",
  role_changed: "text-yellow-400",
};

export default function SuperAdminDashboard() {
  const { signOut } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("dashboard");

  // Dashboard
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Analytics
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Schools
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolStatusFilter, setSchoolStatusFilter] = useState("all");
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [toggleSchoolDialog, setToggleSchoolDialog] = useState<School | null>(null);

  // Users
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userSchoolFilter, setUserSchoolFilter] = useState("all");
  const [deleteUserDialog, setDeleteUserDialog] = useState<UserRecord | null>(null);
  const [changeRoleUser, setChangeRoleUser] = useState<{ user: UserRecord; role: string } | null>(null);

  // Deletion Requests
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<DeletionRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [approveDialog, setApproveDialog] = useState<DeletionRequest | null>(null);
  const [executeDeletionDialog, setExecuteDeletionDialog] = useState<DeletionRequest | null>(null);

  // Domain Requests
  const [domainRequests, setDomainRequests] = useState<DomainRequest[]>([]);
  const [domainRequestsLoading, setDomainRequestsLoading] = useState(false);
  const [approvingDomainId, setApprovingDomainId] = useState<string | null>(null);

  // Subscriptions
  const [subscriptionSchools, setSubscriptionSchools] = useState<SubscriptionSchool[]>([]);
  const [subscriptionsSummary, setSubscriptionsSummary] = useState<SubscriptionsSummary | null>(null);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [editSubscription, setEditSubscription] = useState<SubscriptionSchool | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({ plan: "free", subscription_status: "active", amount: "0", trialEndsAt: "" });
  const [savingSubscription, setSavingSubscription] = useState(false);

  // Feature flags
  const [featureFlagsDialog, setFeatureFlagsDialog] = useState<{ id: string; name: string; features: Record<string, boolean> } | null>(null);
  const [savingFeatures, setSavingFeatures] = useState(false);

  // Quick delete (empty schools)
  const [quickDeleteDialog, setQuickDeleteDialog] = useState<{ id: string; name: string } | null>(null);
  const [quickDeleting, setQuickDeleting] = useState(false);

  const handleQuickDelete = async () => {
    if (!quickDeleteDialog) return;
    setQuickDeleting(true);
    try {
      const res = await apiFetch(`/api/super-admin/schools/${quickDeleteDialog.id}/quick-delete`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete");
      }
      toast.success(`"${quickDeleteDialog.name}" deleted.`);
      setQuickDeleteDialog(null);
      fetchSchools();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete school");
    } finally {
      setQuickDeleting(false);
    }
  };

  // Archive
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState<ArchiveEntry | null>(null);

  // Audit Log
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null);

  // Platform Settings
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Fetch helpers
  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const json = await res.json();
      setDashboardData(json);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/analytics");
      if (!res.ok) throw new Error();
      setAnalyticsData(await res.json());
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchSchools = useCallback(async () => {
    setSchoolsLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/schools");
      if (!res.ok) throw new Error();
      setSchools(await res.json());
    } catch {
      toast.error("Failed to load schools");
    } finally {
      setSchoolsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/users");
      if (!res.ok) throw new Error();
      setUsers(await res.json());
    } catch {
      toast.error("Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchDeletionRequests = useCallback(async () => {
    setDeletionLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/deletion-requests");
      if (!res.ok) throw new Error();
      setDeletionRequests(await res.json());
    } catch {
      toast.error("Failed to load deletion requests");
    } finally {
      setDeletionLoading(false);
    }
  }, []);

  const fetchDomainRequests = useCallback(async () => {
    setDomainRequestsLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/domain-requests");
      if (!res.ok) throw new Error();
      setDomainRequests(await res.json());
    } catch {
      toast.error("Failed to load domain requests");
    } finally {
      setDomainRequestsLoading(false);
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/subscriptions");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSubscriptionsSummary(data.summary);
      setSubscriptionSchools(data.schools);
    } catch {
      toast.error("Failed to load subscriptions");
    } finally {
      setSubscriptionsLoading(false);
    }
  }, []);

  const openEditSubscription = (s: SubscriptionSchool) => {
    setEditSubscription(s);
    setSubscriptionForm({
      plan: s.plan,
      subscription_status: s.subscription_status,
      amount: (s.billing_amount_cents / 100).toFixed(2),
      trialEndsAt: s.trial_ends_at ? s.trial_ends_at.slice(0, 10) : "",
    });
  };

  const handleSaveSubscription = async () => {
    if (!editSubscription) return;
    setSavingSubscription(true);
    try {
      const res = await apiFetch(`/api/super-admin/schools/${editSubscription.id}/subscription`, {
        method: "PATCH",
        body: JSON.stringify({
          plan: subscriptionForm.plan,
          subscription_status: subscriptionForm.subscription_status,
          billing_amount_cents: Math.round(parseFloat(subscriptionForm.amount || "0") * 100),
          trial_ends_at: subscriptionForm.trialEndsAt || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update subscription");
      }
      toast.success("Subscription updated");
      setEditSubscription(null);
      fetchSubscriptions();
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription");
    } finally {
      setSavingSubscription(false);
    }
  };

  const openFeatureFlags = async (schoolId: string, schoolName: string) => {
    try {
      const res = await apiFetch(`/api/super-admin/schools/${schoolId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFeatureFlagsDialog({
        id: schoolId,
        name: schoolName,
        features: data.school?.enabled_features ?? {},
      });
    } catch {
      toast.error("Failed to load feature flags");
    }
  };

  const handleSaveFeatureFlags = async () => {
    if (!featureFlagsDialog) return;
    setSavingFeatures(true);
    try {
      const res = await apiFetch(`/api/super-admin/schools/${featureFlagsDialog.id}/features`, {
        method: "PATCH",
        body: JSON.stringify({ enabled_features: featureFlagsDialog.features }),
      });
      if (!res.ok) throw new Error();
      toast.success("Feature flags updated");
      setFeatureFlagsDialog(null);
      fetchSchools();
    } catch {
      toast.error("Failed to update feature flags");
    } finally {
      setSavingFeatures(false);
    }
  };

  const handleApproveDomain = async (schoolId: string) => {
    setApprovingDomainId(schoolId);
    try {
      const res = await apiFetch(`/api/super-admin/schools/${schoolId}/custom-domain/approve`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to approve domain");
      }
      toast.success("Domain approved — the school admin has been notified to complete verification");
      fetchDomainRequests();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve domain");
    } finally {
      setApprovingDomainId(null);
    }
  };

  const fetchArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/archive");
      if (!res.ok) throw new Error();
      setArchive(await res.json());
    } catch {
      toast.error("Failed to load archive");
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditDateFrom) params.set("from", auditDateFrom);
      if (auditDateTo) params.set("to", auditDateTo);
      if (auditActionFilter !== "all") params.set("action", auditActionFilter);
      const res = await apiFetch(`/api/super-admin/audit-log?${params}`);
      if (!res.ok) throw new Error();
      setAuditLogs(await res.json());
    } catch {
      toast.error("Failed to load audit log");
    } finally {
      setAuditLoading(false);
    }
  }, [auditDateFrom, auditDateTo, auditActionFilter]);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await apiFetch("/api/super-admin/platform-settings");
      if (!res.ok) throw new Error();
      setSettings(await res.json());
    } catch {
      toast.error("Failed to load platform settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === "dashboard") fetchDashboard();
    if (activeSection === "analytics") fetchAnalytics();
    if (activeSection === "schools") fetchSchools();
    if (activeSection === "users") fetchUsers();
    if (activeSection === "deletion-requests") fetchDeletionRequests();
    if (activeSection === "domain-requests") fetchDomainRequests();
    if (activeSection === "subscriptions") fetchSubscriptions();
    if (activeSection === "archive") fetchArchive();
    if (activeSection === "audit-log") fetchAuditLogs();
    if (activeSection === "platform-settings") fetchSettings();
  }, [activeSection]);

  // Actions
  const handleToggleSchool = async () => {
    if (!toggleSchoolDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/schools/${toggleSchoolDialog.id}/toggle-active`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      toast.success(`School ${toggleSchoolDialog.status === "active" ? "deactivated" : "activated"}`);
      setToggleSchoolDialog(null);
      fetchSchools();
    } catch {
      toast.error("Failed to toggle school status");
    }
  };

  const handleChangeRole = async () => {
    if (!changeRoleUser) return;
    try {
      const res = await apiFetch(`/api/super-admin/users/${changeRoleUser.user.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: changeRoleUser.role }),
      });
      if (!res.ok) throw new Error();
      toast.success("Role updated");
      setChangeRoleUser(null);
      fetchUsers();
    } catch {
      toast.error("Failed to change role");
    }
  };

  const [viewingAsId, setViewingAsId] = useState<string | null>(null);

  const handleViewAs = async (user: UserRecord) => {
    setViewingAsId(user.id);
    try {
      const { startImpersonation } = await import("@/lib/impersonation");
      await startImpersonation(user.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to start view-as session");
      setViewingAsId(null);
    }
  };

  const handleSuspendUser = async (user: UserRecord) => {
    try {
      const res = await apiFetch(`/api/super-admin/users/${user.id}/suspend`, { method: "PATCH" });
      if (!res.ok) throw new Error();
      toast.success(user.suspended ? "User unsuspended" : "User suspended");
      fetchUsers();
    } catch {
      toast.error("Failed to update suspension");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/users/${deleteUserDialog.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("User deleted");
      setDeleteUserDialog(null);
      fetchUsers();
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const handleApprove = async () => {
    if (!approveDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/deletion-requests/${approveDialog.id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Deletion request approved");
      setApproveDialog(null);
      fetchDeletionRequests();
    } catch {
      toast.error("Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/deletion-requests/${rejectDialog.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ review_notes: rejectNotes }),
      });
      if (!res.ok) throw new Error();
      toast.success("Deletion request rejected");
      setRejectDialog(null);
      setRejectNotes("");
      fetchDeletionRequests();
    } catch {
      toast.error("Failed to reject");
    }
  };

  const handleExecuteDeletion = async () => {
    if (!executeDeletionDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/schools/${executeDeletionDialog.schoolId}/execute-deletion`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("School deleted and moved to archive");
      setExecuteDeletionDialog(null);
      fetchDeletionRequests();
    } catch {
      toast.error("Failed to execute deletion");
    }
  };

  const handleRestore = async () => {
    if (!restoreDialog) return;
    try {
      const res = await apiFetch(`/api/super-admin/archive/${restoreDialog.id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("School restored");
      setRestoreDialog(null);
      fetchArchive();
    } catch {
      toast.error("Failed to restore school");
    }
  };

  const handleSaveSetting = async (field: string, value: unknown) => {
    setSavingField(field);
    try {
      const res = await apiFetch("/api/super-admin/platform-settings", {
        method: "PUT",
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      toast.success("Setting saved");
    } catch {
      toast.error("Failed to save setting");
    } finally {
      setSavingField(null);
    }
  };

  // Nav items
  const navItems: Array<{ section: Section; label: string; icon: React.ReactNode; group: string }> = [
    { section: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} />, group: "OVERVIEW" },
    { section: "analytics", label: "Analytics", icon: <TrendingUp size={16} />, group: "OVERVIEW" },
    { section: "schools", label: "Schools", icon: <Building2 size={16} />, group: "MANAGEMENT" },
    { section: "users", label: "All Users", icon: <Users size={16} />, group: "MANAGEMENT" },
    { section: "deletion-requests", label: "Deletion Requests", icon: <AlertTriangle size={16} />, group: "MANAGEMENT" },
    { section: "domain-requests", label: "Domain Requests", icon: <Globe size={16} />, group: "MANAGEMENT" },
    { section: "subscriptions", label: "Subscriptions", icon: <DollarSign size={16} />, group: "MANAGEMENT" },
    { section: "archive", label: "Archive", icon: <Archive size={16} />, group: "MANAGEMENT" },
    { section: "audit-log", label: "Audit Log", icon: <FileText size={16} />, group: "SYSTEM" },
    { section: "platform-settings", label: "Platform Settings", icon: <Settings size={16} />, group: "SYSTEM" },
    { section: "profile", label: "My Profile", icon: <Shield size={16} />, group: "ACCOUNT" },
  ];

  const groups = ["OVERVIEW", "MANAGEMENT", "SYSTEM", "ACCOUNT"];

  const pendingCount = deletionRequests.filter((r) => r.status === "pending").length;
  const pendingDomainCount = domainRequests.filter((r) => r.status === "requested").length;

  // Filtered data
  const filteredSchools = schools.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || s.owner.toLowerCase().includes(schoolSearch.toLowerCase());
    const matchStatus = schoolStatusFilter === "all" || s.status === schoolStatusFilter;
    return matchSearch && matchStatus;
  });

  const filteredUsers = users.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
    const matchSchool = userSchoolFilter === "all" || u.school === userSchoolFilter;
    return matchSearch && matchRole && matchSchool;
  });

  const uniqueSchools = Array.from(new Set(users.map((u) => u.school))).filter(Boolean);

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 flex flex-col flex-shrink-0 border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-blue-400" />
            <span className="font-bold text-sm text-white leading-tight">SolomonQuest Platform</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Super Admin Console</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {groups.map((group) => {
            const items = navItems.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mb-4">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider px-4 py-2">{group}</p>
                {items.map((item) => (
                  <button
                    key={item.section}
                    onClick={() => setActiveSection(item.section)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${
                      activeSection === item.section
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.section === "deletion-requests" && pendingCount > 0 && (
                      <span className="ml-auto bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                        {pendingCount}
                      </span>
                    )}
                    {item.section === "domain-requests" && pendingDomainCount > 0 && (
                      <span className="ml-auto bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                        {pendingDomainCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={() => signOut?.()}
            className="flex items-center gap-2 text-gray-400 hover:text-red-400 text-sm transition-colors w-full"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-lg font-semibold capitalize text-white">
            {activeSection.replace(/-/g, " ")}
          </h1>
          <button
            onClick={() => {
              if (activeSection === "dashboard") fetchDashboard();
              if (activeSection === "analytics") fetchAnalytics();
              if (activeSection === "schools") fetchSchools();
              if (activeSection === "users") fetchUsers();
              if (activeSection === "deletion-requests") fetchDeletionRequests();
              if (activeSection === "domain-requests") fetchDomainRequests();
              if (activeSection === "subscriptions") fetchSubscriptions();
              if (activeSection === "archive") fetchArchive();
              if (activeSection === "audit-log") fetchAuditLogs();
              if (activeSection === "platform-settings") fetchSettings();
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-950">

          {/* DASHBOARD */}
          {activeSection === "dashboard" && (
            <div>
              {dashboardLoading && <p className="text-gray-400">Loading...</p>}
              {dashboardData && (
                <>
                  {/* Big stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <StatCard icon={<Building2 size={24} />} color="text-blue-400 bg-blue-900/30" label="Total Schools" value={dashboardData.totalSchools} />
                    <StatCard icon={<Users size={24} />} color="text-green-400 bg-green-900/30" label="Total Users" value={dashboardData.totalUsers} />
                    <StatCard icon={<BookOpen size={24} />} color="text-purple-400 bg-purple-900/30" label="Active Courses" value={dashboardData.activeCourses} />
                    <StatCard icon={<AlertTriangle size={24} />} color="text-orange-400 bg-orange-900/30" label="Pending Deletions" value={dashboardData.pendingDeletions} />
                  </div>

                  {/* Smaller stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    {[
                      { label: "New Schools This Month", value: dashboardData.newSchoolsThisMonth },
                      { label: "New Users This Month", value: dashboardData.newUsersThisMonth },
                      { label: "Active Schools", value: dashboardData.activeSchools },
                      { label: "Schools in Archive", value: dashboardData.archivedSchools },
                    ].map((s) => (
                      <div key={s.label} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                        <p className="text-xs text-gray-400">{s.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recent signups */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 mb-6">
                    <div className="px-4 py-3 border-b border-gray-700">
                      <h2 className="font-semibold text-white">Recent Sign-ups</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left px-4 py-2">Name</th>
                            <th className="text-left px-4 py-2">Role</th>
                            <th className="text-left px-4 py-2">School</th>
                            <th className="text-left px-4 py-2">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.recentSignups.map((u) => (
                            <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                              <td className="px-4 py-2 text-white">{u.name}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-700 text-gray-300"}`}>{u.role}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-300">{u.school}</td>
                              <td className="px-4 py-2 text-gray-400">{new Date(u.joined).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => setActiveSection("deletion-requests")}
                      className="bg-orange-700 hover:bg-orange-600 text-white relative"
                    >
                      View Deletion Requests
                      {dashboardData.pendingDeletions > 0 && (
                        <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{dashboardData.pendingDeletions}</span>
                      )}
                    </Button>
                    <Button onClick={() => setActiveSection("archive")} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                      View Archived Schools
                    </Button>
                    <Button onClick={() => setActiveSection("platform-settings")} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                      Platform Settings
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ANALYTICS */}
          {activeSection === "analytics" && (
            <div>
              {analyticsLoading && <p className="text-gray-400">Loading...</p>}
              {analyticsData && (
                <div className="space-y-6">
                  {/* Schools Growth */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <h2 className="font-semibold text-white mb-4">Schools Growth</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={analyticsData.schoolsGrowth}>
                        <XAxis dataKey="month" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#fff" }} />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Users Growth */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <h2 className="font-semibold text-white mb-4">Users Growth</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={analyticsData.usersGrowth}>
                        <XAxis dataKey="month" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#fff" }} />
                        <Legend />
                        <Line type="monotone" dataKey="students" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="teachers" stroke="#34d399" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="admins" stroke="#60a5fa" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top Schools */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <h2 className="font-semibold text-white mb-4">Top Schools by Enrollment</h2>
                    <div className="space-y-3">
                      {analyticsData.topSchools.map((s) => {
                        const max = Math.max(...analyticsData.topSchools.map((x) => x.students));
                        const pct = max > 0 ? (s.students / max) * 100 : 0;
                        return (
                          <div key={s.name} className="flex items-center gap-3">
                            <span className="text-sm text-gray-300 w-40 truncate">{s.name}</span>
                            <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm text-white w-12 text-right">{s.students}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Application Stats */}
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <h2 className="font-semibold text-white mb-4">Application Stats</h2>
                    <div className="flex gap-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-400">{analyticsData.applicationStats.approved}</p>
                        <p className="text-sm text-gray-400 mt-1">Approved</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-red-400">{analyticsData.applicationStats.rejected}</p>
                        <p className="text-sm text-gray-400 mt-1">Rejected</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-yellow-400">{analyticsData.applicationStats.pending}</p>
                        <p className="text-sm text-gray-400 mt-1">Pending</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCHOOLS */}
          {activeSection === "schools" && (
            <div>
              <div className="flex flex-wrap gap-3 mb-4">
                <Input
                  placeholder="Search schools or owner..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  className="w-64 bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                />
                <select
                  value={schoolStatusFilter}
                  onChange={(e) => setSchoolStatusFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              {schoolsLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">School Name</th>
                      <th className="text-left px-4 py-3">Owner</th>
                      <th className="text-left px-4 py-3">Students</th>
                      <th className="text-left px-4 py-3">Teachers</th>
                      <th className="text-left px-4 py-3">Courses</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Created</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSchools.map((school) => (
                      <>
                        <tr key={school.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-white font-medium">{school.name}</td>
                          <td className="px-4 py-3 text-gray-300">{school.owner}</td>
                          <td className="px-4 py-3 text-gray-300">{school.students}</td>
                          <td className="px-4 py-3 text-gray-300">{school.teachers}</td>
                          <td className="px-4 py-3 text-gray-300">{school.courses}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${school.status === "active" ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
                              {school.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{new Date(school.created).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-gray-600 text-gray-300 hover:bg-gray-700 h-7 text-xs"
                                onClick={() => setExpandedSchool(expandedSchool === school.id ? null : school.id)}
                              >
                                {expandedSchool === school.id ? "Hide" : "View"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-gray-600 text-blue-300 hover:bg-blue-900/30"
                                onClick={() => openFeatureFlags(school.id, school.name)}
                              >
                                <ToggleLeft size={12} className="mr-1" />
                                Features
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 text-xs border-gray-600 ${school.status === "active" ? "text-orange-400 hover:bg-orange-900/30" : "text-green-400 hover:bg-green-900/30"}`}
                                onClick={() => setToggleSchoolDialog(school)}
                              >
                                {school.status === "active" ? "Deactivate" : "Activate"}
                              </Button>
                              {school.students === 0 && school.teachers === 0 && school.courses === 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-red-800 text-red-400 hover:bg-red-900/30"
                                  onClick={() => setQuickDeleteDialog({ id: school.id, name: school.name })}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedSchool === school.id && (
                          <tr key={`${school.id}-detail`} className="bg-gray-900/60">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-gray-400 text-xs mb-1">School ID</p>
                                  <p className="text-white font-mono">{school.id}</p>
                                </div>
                                <div>
                                  <p className="text-gray-400 text-xs mb-1">Owner</p>
                                  <p className="text-white">{school.owner}</p>
                                </div>
                                {school.details && Object.entries(school.details).map(([k, v]) => (
                                  <div key={k}>
                                    <p className="text-gray-400 text-xs mb-1 capitalize">{k.replace(/_/g, " ")}</p>
                                    <p className="text-white">{String(v)}</p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                {filteredSchools.length === 0 && !schoolsLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No schools found.</p>
                )}
              </div>
            </div>
          )}

          {/* ALL USERS */}
          {activeSection === "users" && (
            <div>
              <div className="flex flex-wrap gap-3 mb-4">
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-64 bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                />
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                >
                  <option value="all">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                </select>
                <select
                  value={userSchoolFilter}
                  onChange={(e) => setUserSchoolFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                >
                  <option value="all">All Schools</option>
                  {uniqueSchools.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {usersLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Role</th>
                      <th className="text-left px-4 py-3">School</th>
                      <th className="text-left px-4 py-3">Joined</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${user.suspended ? "opacity-60" : ""}`}>
                        <td className="px-4 py-3 text-white">{user.name}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? "bg-gray-700 text-gray-300"}`}>{user.role}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{user.school}</td>
                        <td className="px-4 py-3 text-gray-400">{new Date(user.joined).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              defaultValue={user.role}
                              className="bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 text-xs"
                              onChange={(e) => setChangeRoleUser({ user, role: e.target.value })}
                            >
                              <option value="super_admin">super_admin</option>
                              <option value="admin">admin</option>
                              <option value="teacher">teacher</option>
                              <option value="student">student</option>
                            </select>
                            {(user.role === "teacher" || user.role === "staff" || user.role === "student") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-gray-600 text-blue-300 hover:bg-blue-900/30"
                                disabled={viewingAsId === user.id}
                                onClick={() => handleViewAs(user)}
                              >
                                {viewingAsId === user.id ? "Switching…" : "View As"}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs border-gray-600 ${user.suspended ? "text-green-400 hover:bg-green-900/30" : "text-orange-400 hover:bg-orange-900/30"}`}
                              onClick={() => handleSuspendUser(user)}
                            >
                              {user.suspended ? "Unsuspend" : "Suspend"}
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-800"
                              onClick={() => setDeleteUserDialog(user)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && !usersLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No users found.</p>
                )}
              </div>
            </div>
          )}

          {/* DELETION REQUESTS */}
          {activeSection === "deletion-requests" && (
            <div>
              {deletionLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">School</th>
                      <th className="text-left px-4 py-3">Requester</th>
                      <th className="text-left px-4 py-3">Reason</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Requested At</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletionRequests.map((req) => (
                      <tr key={req.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-white font-medium">{req.school}</td>
                        <td className="px-4 py-3 text-gray-300">{req.requester}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{req.reason}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-400">{new Date(req.requestedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {req.status === "pending" && (
                              <>
                                <Button size="sm" className="h-7 text-xs bg-green-800 hover:bg-green-700 text-white" onClick={() => setApproveDialog(req)}>
                                  Approve
                                </Button>
                                <Button size="sm" className="h-7 text-xs bg-red-900/50 hover:bg-red-800 text-red-300 border border-red-800" onClick={() => setRejectDialog(req)}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {req.status === "approved" && (
                              <Button size="sm" className="h-7 text-xs bg-red-800 hover:bg-red-700 text-white" onClick={() => setExecuteDeletionDialog(req)}>
                                Execute Deletion
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {deletionRequests.length === 0 && !deletionLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No deletion requests.</p>
                )}
              </div>
            </div>
          )}

          {/* SUBSCRIPTIONS */}
          {activeSection === "subscriptions" && (
            <div>
              <p className="text-gray-400 text-sm mb-4">
                No payment processor is connected yet — plan, status, and price are managed manually here as the
                sales/billing source of truth.
              </p>
              {subscriptionsSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <p className="text-xs text-gray-400">Monthly Recurring Revenue</p>
                    <p className="text-2xl font-bold text-white mt-0.5">
                      ${(subscriptionsSummary.mrr_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <StatCard icon={<CheckCircle size={20} />} color="text-green-400 bg-green-900/30" label="Active" value={subscriptionsSummary.by_status.active ?? 0} />
                  <StatCard icon={<Clock size={20} />} color="text-blue-400 bg-blue-900/30" label="Trialing" value={subscriptionsSummary.by_status.trialing ?? 0} />
                  <StatCard icon={<AlertTriangle size={20} />} color="text-red-400 bg-red-900/30" label="Past Due / Canceled" value={(subscriptionsSummary.by_status.past_due ?? 0) + (subscriptionsSummary.by_status.canceled ?? 0)} />
                </div>
              )}
              {subscriptionsLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">School</th>
                      <th className="text-left px-4 py-3">Plan</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Price</th>
                      <th className="text-left px-4 py-3">Trial Ends</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionSchools.map((s) => (
                      <tr key={s.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-white font-medium">{s.name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 capitalize">{s.plan}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.subscription_status} />
                        </td>
                        <td className="px-4 py-3 text-gray-300">${(s.billing_amount_cents / 100).toFixed(2)}/mo</td>
                        <td className="px-4 py-3 text-gray-400">{s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" className="h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700" onClick={() => openEditSubscription(s)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {subscriptionSchools.length === 0 && !subscriptionsLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No schools yet.</p>
                )}
              </div>
            </div>
          )}

          {/* DOMAIN REQUESTS */}
          {activeSection === "domain-requests" && (
            <div>
              <p className="text-gray-400 text-sm mb-4">
                When a school admin submits a domain, add it in your hosting provider's domain settings first, then
                click Approve — this generates the DNS records and notifies the school admin to finish connecting it.
              </p>
              {domainRequestsLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">School</th>
                      <th className="text-left px-4 py-3">Domain</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Requested At</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domainRequests.map((req) => (
                      <tr key={req.schoolId} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="px-4 py-3 text-white font-medium">{req.schoolName}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono">{req.domain}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {req.status === "requested" && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-800 hover:bg-green-700 text-white"
                              disabled={approvingDomainId === req.schoolId}
                              onClick={() => handleApproveDomain(req.schoolId)}
                            >
                              {approvingDomainId === req.schoolId ? "Approving..." : "Approve"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {domainRequests.length === 0 && !domainRequestsLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No domain requests.</p>
                )}
              </div>
            </div>
          )}

          {/* ARCHIVE */}
          {activeSection === "archive" && (
            <div>
              {archiveLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">School Name</th>
                      <th className="text-left px-4 py-3">Deleted At</th>
                      <th className="text-left px-4 py-3">Days Remaining</th>
                      <th className="text-left px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.map((entry) => (
                      <tr key={entry.id} className={`border-b border-gray-700/50 hover:bg-gray-700/30 ${entry.expired ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 text-white font-medium">{entry.schoolName}</td>
                        <td className="px-4 py-3 text-gray-400">{new Date(entry.deletedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          {entry.expired ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Expired</span>
                          ) : (
                            <span className={`font-semibold ${entry.daysRemaining < 7 ? "text-red-400" : "text-gray-300"}`}>
                              {entry.daysRemaining} days
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!entry.expired && (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-blue-800 hover:bg-blue-700 text-white"
                              onClick={() => setRestoreDialog(entry)}
                            >
                              Restore
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {archive.length === 0 && !archiveLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">Archive is empty.</p>
                )}
              </div>
            </div>
          )}

          {/* AUDIT LOG */}
          {activeSection === "audit-log" && (
            <div>
              <div className="flex flex-wrap gap-3 mb-4">
                <Input
                  type="date"
                  value={auditDateFrom}
                  onChange={(e) => setAuditDateFrom(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white w-44"
                />
                <Input
                  type="date"
                  value={auditDateTo}
                  onChange={(e) => setAuditDateTo(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white w-44"
                />
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded px-3 py-2 text-sm"
                >
                  <option value="all">All Actions</option>
                  <option value="school_deleted">school_deleted</option>
                  <option value="school_restored">school_restored</option>
                  <option value="user_suspended">user_suspended</option>
                  <option value="user_deleted">user_deleted</option>
                  <option value="settings_updated">settings_updated</option>
                  <option value="school_created">school_created</option>
                  <option value="role_changed">role_changed</option>
                </select>
                <Button onClick={fetchAuditLogs} className="bg-gray-700 hover:bg-gray-600 text-white">
                  Apply Filters
                </Button>
              </div>
              {auditLoading && <p className="text-gray-400">Loading...</p>}
              <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-900/50">
                      <th className="text-left px-4 py-3">Actor</th>
                      <th className="text-left px-4 py-3">Action</th>
                      <th className="text-left px-4 py-3">Target</th>
                      <th className="text-left px-4 py-3">Details</th>
                      <th className="text-left px-4 py-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <>
                        <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-gray-300">{log.actor}</td>
                          <td className="px-4 py-3">
                            <span className={`font-mono text-xs ${ACTION_COLORS[log.action] ?? "text-gray-300"}`}>{log.action}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-300">{log.target}</td>
                          <td className="px-4 py-3">
                            <button
                              className="text-xs text-blue-400 hover:text-blue-300"
                              onClick={() => setExpandedAudit(expandedAudit === log.id ? null : log.id)}
                            >
                              {expandedAudit === log.id ? "Hide" : "Show"}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                        </tr>
                        {expandedAudit === log.id && (
                          <tr key={`${log.id}-detail`} className="bg-gray-900/60">
                            <td colSpan={5} className="px-6 py-3">
                              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{log.details}</pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length === 0 && !auditLoading && (
                  <p className="text-gray-500 text-sm text-center py-8">No audit logs found.</p>
                )}
              </div>
            </div>
          )}

          {/* PLATFORM SETTINGS */}
          {activeSection === "platform-settings" && (
            <div>
              {settingsLoading && <p className="text-gray-400">Loading...</p>}
              {settings && (
                <div className="space-y-4 max-w-2xl">
                  <SettingNumberCard
                    label="Max Schools Per Admin"
                    value={settings.maxSchoolsPerAdmin}
                    onChange={(v) => setSettings({ ...settings, maxSchoolsPerAdmin: v })}
                    onSave={() => handleSaveSetting("maxSchoolsPerAdmin", settings.maxSchoolsPerAdmin)}
                    saving={savingField === "maxSchoolsPerAdmin"}
                  />
                  <SettingNumberCard
                    label="Max Students Per School"
                    value={settings.maxStudentsPerSchool}
                    onChange={(v) => setSettings({ ...settings, maxStudentsPerSchool: v })}
                    onSave={() => handleSaveSetting("maxStudentsPerSchool", settings.maxStudentsPerSchool)}
                    saving={savingField === "maxStudentsPerSchool"}
                  />
                  <SettingNumberCard
                    label="Max Courses Per School"
                    value={settings.maxCoursesPerSchool}
                    onChange={(v) => setSettings({ ...settings, maxCoursesPerSchool: v })}
                    onSave={() => handleSaveSetting("maxCoursesPerSchool", settings.maxCoursesPerSchool)}
                    saving={savingField === "maxCoursesPerSchool"}
                  />
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-white font-medium">Allow School Registration</p>
                        <p className="text-xs text-gray-400 mt-0.5">Enable or disable new school sign-ups</p>
                      </div>
                      <Switch
                        checked={settings.allowSchoolRegistration}
                        onCheckedChange={(v) => setSettings({ ...settings, allowSchoolRegistration: v })}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="bg-blue-700 hover:bg-blue-600 text-white"
                      onClick={() => handleSaveSetting("allowSchoolRegistration", settings.allowSchoolRegistration)}
                      disabled={savingField === "allowSchoolRegistration"}
                    >
                      {savingField === "allowSchoolRegistration" ? "Saving..." : "Save"}
                    </Button>
                  </div>
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-white font-medium">Maintenance Mode</p>
                        <p className="text-xs text-gray-400 mt-0.5">Show maintenance page to all users</p>
                      </div>
                      <Switch
                        checked={settings.maintenanceMode}
                        onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
                      />
                    </div>
                    {settings.maintenanceMode && (
                      <textarea
                        value={settings.maintenanceMessage}
                        onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                        placeholder="Maintenance message shown to users..."
                        rows={3}
                        className="w-full bg-gray-700 border border-gray-600 rounded text-white text-sm p-2 mb-3 resize-none"
                      />
                    )}
                    <Button
                      size="sm"
                      className="bg-blue-700 hover:bg-blue-600 text-white"
                      onClick={() => handleSaveSetting("maintenanceMode", { mode: settings.maintenanceMode, message: settings.maintenanceMessage })}
                      disabled={savingField === "maintenanceMode"}
                    >
                      {savingField === "maintenanceMode" ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFILE */}
          {activeSection === "profile" && (
            <div className="max-w-md">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-700 flex items-center justify-center">
                    <Shield size={28} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-lg">Super Admin</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-700 text-red-100">super_admin</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm">You have full platform management access. Use this console to manage schools, users, and platform configuration.</p>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Dialogs */}

      {/* Toggle School */}
      <Dialog open={!!toggleSchoolDialog} onOpenChange={() => setToggleSchoolDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Confirm Status Change</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Are you sure you want to {toggleSchoolDialog?.status === "active" ? "deactivate" : "activate"}{" "}
            <strong>{toggleSchoolDialog?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setToggleSchoolDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600 text-white" onClick={handleToggleSchool}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subscription */}
      <Dialog open={!!editSubscription} onOpenChange={() => setEditSubscription(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Subscription — {editSubscription?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Plan</label>
              <select
                value={subscriptionForm.plan}
                onChange={(e) => setSubscriptionForm((f) => ({ ...f, plan: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-2 text-sm"
              >
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select
                value={subscriptionForm.subscription_status}
                onChange={(e) => setSubscriptionForm((f) => ({ ...f, subscription_status: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 text-white rounded px-3 py-2 text-sm"
              >
                <option value="trialing">Trialing</option>
                <option value="active">Active</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Monthly Price (USD)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={subscriptionForm.amount}
                onChange={(e) => setSubscriptionForm((f) => ({ ...f, amount: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Trial Ends</label>
              <Input
                type="date"
                value={subscriptionForm.trialEndsAt}
                onChange={(e) => setSubscriptionForm((f) => ({ ...f, trialEndsAt: e.target.value }))}
                className="bg-gray-900 border-gray-700 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setEditSubscription(null)}>
              Cancel
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600 text-white" onClick={handleSaveSubscription} disabled={savingSubscription}>
              {savingSubscription ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature Flags */}
      <Dialog open={!!featureFlagsDialog} onOpenChange={() => setFeatureFlagsDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Feature Flags — {featureFlagsDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { key: "chat", label: "Chat & DMs" },
              { key: "video_calls", label: "Video Calls" },
              { key: "forum", label: "Forum" },
              { key: "ai_agent", label: "AI Assistant (Solomon)" },
              { key: "custom_domain", label: "Custom Domain" },
              { key: "notes", label: "Notes" },
            ].map((f) => (
              <div key={f.key} className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-300">{f.label}</span>
                <Switch
                  checked={featureFlagsDialog?.features[f.key] !== false}
                  onCheckedChange={(v) =>
                    setFeatureFlagsDialog((prev) => (prev ? { ...prev, features: { ...prev.features, [f.key]: v } } : prev))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setFeatureFlagsDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600 text-white" onClick={handleSaveFeatureFlags} disabled={savingFeatures}>
              {savingFeatures ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role */}
      <Dialog open={!!changeRoleUser} onOpenChange={() => setChangeRoleUser(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Confirm Role Change</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Change role of <strong>{changeRoleUser?.user.name}</strong> to <strong>{changeRoleUser?.role}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setChangeRoleUser(null)}>
              Cancel
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600 text-white" onClick={handleChangeRole}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Delete Empty School */}
      <Dialog open={!!quickDeleteDialog} onOpenChange={() => setQuickDeleteDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete School</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Delete <strong>{quickDeleteDialog?.name}</strong>? This school has no students, teachers, or courses and will be permanently removed.
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setQuickDeleteDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-red-700 hover:bg-red-600 text-white" onClick={handleQuickDelete} disabled={quickDeleting}>
              {quickDeleting ? "Deleting…" : "Delete School"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User */}
      <Dialog open={!!deleteUserDialog} onOpenChange={() => setDeleteUserDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Are you sure you want to permanently delete <strong>{deleteUserDialog?.name}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setDeleteUserDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-red-700 hover:bg-red-600 text-white" onClick={handleDeleteUser}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Deletion Request */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Approve Deletion Request</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Approve the deletion request for <strong>{approveDialog?.school}</strong>? The school admin can then execute the deletion.
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setApproveDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-green-700 hover:bg-green-600 text-white" onClick={handleApprove}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Deletion Request */}
      <Dialog open={!!rejectDialog} onOpenChange={() => { setRejectDialog(null); setRejectNotes(""); }}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Reject Deletion Request</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm mb-3">
            Reject the deletion request for <strong>{rejectDialog?.school}</strong>?
          </p>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Review notes (required)..."
            rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded text-white text-sm p-2 resize-none"
          />
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => { setRejectDialog(null); setRejectNotes(""); }}>
              Cancel
            </Button>
            <Button className="bg-red-700 hover:bg-red-600 text-white" onClick={handleReject} disabled={!rejectNotes.trim()}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute Deletion */}
      <Dialog open={!!executeDeletionDialog} onOpenChange={() => setExecuteDeletionDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Execute School Deletion</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            This will permanently delete <strong>{executeDeletionDialog?.school}</strong> and move it to the archive. Proceed?
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setExecuteDeletionDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-red-700 hover:bg-red-600 text-white" onClick={handleExecuteDeletion}>
              Execute Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Archive */}
      <Dialog open={!!restoreDialog} onOpenChange={() => setRestoreDialog(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Restore School</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300 text-sm">
            Are you sure you want to restore <strong>{restoreDialog?.schoolName}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" className="border-gray-600 text-gray-300" onClick={() => setRestoreDialog(null)}>
              Cancel
            </Button>
            <Button className="bg-blue-700 hover:bg-blue-600 text-white" onClick={handleRestore}>
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components

function StatCard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-900 text-yellow-300",
    approved: "bg-green-900 text-green-300",
    rejected: "bg-red-900 text-red-300",
    requested: "bg-blue-900 text-blue-300",
    verified: "bg-green-900 text-green-300",
    failed: "bg-red-900 text-red-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] ?? "bg-gray-700 text-gray-300"}`}>{status}</span>
  );
}

function SettingNumberCard({
  label,
  value,
  onChange,
  onSave,
  saving,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <p className="text-white font-medium mb-3">{label}</p>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 bg-gray-700 border-gray-600 text-white"
          min={0}
        />
        <Button
          size="sm"
          className="bg-blue-700 hover:bg-blue-600 text-white"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
