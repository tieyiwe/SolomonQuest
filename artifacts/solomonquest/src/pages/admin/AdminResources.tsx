import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  FolderOpen,
  Plus,
  Search,
  Link2,
  FileText,
  Image,
  Film,
  File,
  Trash2,
  ExternalLink,
  Upload,
  Globe,
  Lock,
  Loader2,
  Download,
} from "lucide-react";
import { toast } from "sonner";

type ResourceFileType = "file" | "link" | "video" | "document" | "image";
type Visibility = "all" | "teachers" | "students" | "admin";

interface SchoolResource {
  id: string | number;
  title: string;
  description?: string;
  category: string;
  file_type: string;
  file_url: string;
  download_count: number;
  visibility: Visibility;
  uploaded_by: string;
  created_at: string;
}

const CATEGORIES = [
  "General",
  "Curriculum",
  "Forms & Documents",
  "Policies",
  "Media",
  "References",
];

function fileIconComponent(file_type: string) {
  const t = (file_type || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "svg"].includes(t))
    return <Image className="h-5 w-5 text-emerald-600" />;
  if (["mp4", "mov", "avi", "webm"].includes(t))
    return <Film className="h-5 w-5 text-red-600" />;
  if (["pdf", "doc", "docx", "txt"].includes(t))
    return <FileText className="h-5 w-5 text-orange-600" />;
  if (t === "link") return <Link2 className="h-5 w-5 text-blue-600" />;
  return <File className="h-5 w-5 text-gray-600" />;
}

function fileBg(file_type: string) {
  const t = (file_type || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "svg"].includes(t)) return "bg-emerald-50";
  if (["mp4", "mov", "avi", "webm"].includes(t)) return "bg-red-50";
  if (["pdf", "doc", "docx", "txt"].includes(t)) return "bg-orange-50";
  if (t === "link") return "bg-blue-50";
  return "bg-gray-100";
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

interface AddResourceForm {
  title: string;
  description: string;
  file_type: string;
  file_url: string;
  category: string;
  visibility: Visibility;
}

const defaultForm: AddResourceForm = {
  title: "",
  description: "",
  file_type: "pdf",
  file_url: "",
  category: "General",
  visibility: "all",
};

function ResourceCard({
  resource,
  onDelete,
  onDownload,
}: {
  resource: SchoolResource;
  onDelete: (id: string | number) => void;
  onDownload: (resource: SchoolResource) => void;
}) {
  return (
    <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-xl ${fileBg(resource.file_type)} flex items-center justify-center shrink-0`}
          >
            {fileIconComponent(resource.file_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900 text-sm leading-tight">{resource.title}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Resource?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{resource.title}"? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => onDelete(resource.id)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {resource.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {resource.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs capitalize">
                {resource.category}
              </Badge>
              <span className="uppercase text-xs text-muted-foreground">{resource.file_type}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {resource.visibility === "all" ? (
                  <Globe className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                <span className="capitalize">
                  {resource.visibility === "all" ? "Everyone" : resource.visibility}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                By {resource.uploaded_by}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(resource.created_at).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Download className="h-3 w-3" />
                {resource.download_count}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t flex items-center justify-between">
          {resource.file_url && (
            <a
              href={resource.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open resource
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            className="flex items-center gap-1.5 ml-auto"
            onClick={() => onDownload(resource)}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminResources() {
  const { user } = useAuth();
  const [resources, setResources] = useState<SchoolResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | Visibility>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"link" | "file">("link");
  const [form, setForm] = useState<AddResourceForm>(defaultForm);
  const [saving, setSaving] = useState(false);

  const schoolId = (user as any)?.school_id;

  const setField = (key: keyof AddResourceForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fetchResources = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/school-resources?school_id=${schoolId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch resources");
      const data = await res.json();
      setResources(Array.isArray(data) ? data : data.resources ?? []);
    } catch (err: any) {
      toast.error(err.message || "Could not load resources");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleDownload = async (resource: SchoolResource) => {
    try {
      const token = await getToken();
      await fetch(`/api/school-resources/${resource.id}/download`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setResources((prev) =>
        prev.map((r) =>
          r.id === resource.id
            ? { ...r, download_count: r.download_count + 1 }
            : r
        )
      );
    } catch {
      // silently update count failed; still open the resource
    }
    if (resource.file_url) window.open(resource.file_url, "_blank");
  };

  const handleDelete = async (id: string | number) => {
    try {
      const token = await getToken();
      await fetch(`/api/school-resources/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // ignore server errors, remove locally
    }
    setResources((r) => r.filter((res) => res.id !== id));
    toast.success("Resource removed");
  };

  const handleAdd = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (addMode === "link" && !form.file_url.trim()) { toast.error("URL is required"); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        school_id: schoolId,
        title: form.title,
        description: form.description,
        category: form.category,
        visibility: form.visibility,
        file_url: form.file_url,
        file_type: addMode === "link" ? "link" : form.file_type,
      };
      const res = await fetch("/api/school-resources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to upload resource");
      toast.success("Resource added");
      setForm(defaultForm);
      setAddOpen(false);
      fetchResources();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  const filtered = resources.filter((r) => {
    const matchSearch = `${r.title} ${r.description ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === "all" || r.category === categoryFilter;
    const matchVis = visibilityFilter === "all" || r.visibility === visibilityFilter;
    return matchSearch && matchCat && matchVis;
  });

  const categoryCounts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = resources.filter((r) => r.category === cat).length;
    return acc;
  }, {});

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">School Resource Center</h1>
            <p className="text-muted-foreground mt-0.5">
              Share files, links, and documents with your school community.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAddMode("file"); setAddOpen(true); }}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </Button>
            <Button size="sm" onClick={() => { setAddMode("link"); setAddOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </Button>
          </div>
        </div>

        {/* Category summary chips */}
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`p-3 rounded-xl border text-left transition-all ${
              categoryFilter === "all"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <p className="text-lg font-bold text-gray-900">{resources.length}</p>
            <p className="text-xs text-muted-foreground">All</p>
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? "all" : cat)}
              className={`p-3 rounded-xl border text-left transition-all ${
                categoryFilter === cat
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <p className="text-lg font-bold text-gray-900">{categoryCounts[cat] ?? 0}</p>
              <p className="text-xs text-muted-foreground truncate">{cat}</p>
            </button>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search resources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={visibilityFilter}
            onValueChange={(v) => setVisibilityFilter(v as "all" | Visibility)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Audiences</SelectItem>
              <SelectItem value="teachers">Teachers only</SelectItem>
              <SelectItem value="students">Students only</SelectItem>
              <SelectItem value="admin">Admin only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Resource Grid */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-40" />
            <p>Loading resources...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No resources found</p>
            <p className="text-sm mt-1">
              {search || categoryFilter !== "all"
                ? "Try adjusting your filters."
                : "Add your first resource to get started."}
            </p>
            {!search && (
              <Button
                className="mt-4"
                size="sm"
                onClick={() => { setAddMode("link"); setAddOpen(true); }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Resource
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Upload Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{addMode === "link" ? "Add Resource" : "Upload Resource"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Mode toggle */}
            <div className="flex rounded-lg border p-1 gap-1 bg-gray-50">
              <button
                onClick={() => setAddMode("link")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  addMode === "link" ? "bg-white shadow-sm text-gray-900" : "text-muted-foreground"
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                Link / URL
              </button>
              <button
                onClick={() => setAddMode("file")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  addMode === "file" ? "bg-white shadow-sm text-gray-900" : "text-muted-foreground"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                File URL
              </button>
            </div>

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                placeholder="Resource title..."
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description..."
                rows={2}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{addMode === "link" ? "URL *" : "File URL *"}</Label>
              <Input
                type="url"
                placeholder="https://..."
                value={form.file_url}
                onChange={(e) => setField("file_url", e.target.value)}
              />
            </div>

            {addMode === "file" && (
              <div className="space-y-1.5">
                <Label>File Type</Label>
                <Select value={form.file_type} onValueChange={(v) => setField("file_type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "png", "txt", "mp4", "other"].map((t) => (
                      <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Visible to</Label>
                <Select value={form.visibility} onValueChange={(v) => setField("visibility", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="teachers">Teachers only</SelectItem>
                    <SelectItem value="students">Students only</SelectItem>
                    <SelectItem value="admin">Admin only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={handleAdd} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {addMode === "link" ? "Add Resource" : "Upload Resource"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
