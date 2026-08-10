import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { useGetMyCourses } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  FolderOpen,
  Upload,
  Link2,
  Plus,
  Loader2,
  ExternalLink,
  FileText,
  BookOpen,
  X,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Resource {
  id: string;
  title: string;
  url: string;
  type: "link" | "file";
  section?: string;
  courseId: string;
  courseName: string;
  createdAt: string;
}

/** Raw shape returned by GET/POST /courses/:courseId/resources. */
interface RawResource {
  id: string;
  title: string;
  resource_type: "file" | "link" | "video" | "document";
  file_url: string | null;
  external_url: string | null;
  section: string | null;
  created_at: string;
}

function mapResource(r: RawResource, courseId: string, courseName: string): Resource {
  return {
    id: r.id,
    title: r.title,
    url: r.file_url ?? r.external_url ?? "",
    type: r.file_url ? "file" : "link",
    section: r.section ?? undefined,
    courseId,
    courseName,
    createdAt: r.created_at,
  };
}

export default function TeacherResources() {
  const { session } = useAuth();
  const { data: courses, isLoading: isCoursesLoading } = useGetMyCourses();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [addType, setAddType] = useState<"link" | "file">("link");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceSection, setResourceSection] = useState("");
  const [resourceCourseId, setResourceCourseId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  // Aggregates resources across every course the teacher owns — there's no
  // single "all my resources" endpoint, so fetch each course's resources in
  // parallel and merge. This also fixes the page never loading anything at
  // all: it previously only ever showed resources added in the current tab
  // session (nothing was ever fetched from the server).
  const loadResources = useCallback(async () => {
    if (!courses || courses.length === 0) return;
    setIsLoadingResources(true);
    try {
      const results = await Promise.all(
        courses.map(async (course) => {
          const res = await fetch(`/api/courses/${course.id}/resources`, {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (!res.ok) return [];
          const data: RawResource[] = await res.json();
          return data.map((r) => mapResource(r, course.id, course.title));
        })
      );
      setResources(
        results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    } catch {
      toast.error("Failed to load resources");
    } finally {
      setIsLoadingResources(false);
    }
  }, [courses, session?.access_token]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const handleAddLink = async () => {
    if (!resourceTitle.trim()) { toast.error("Please enter a resource title"); return; }
    if (!resourceUrl.trim()) { toast.error("Please enter a URL"); return; }
    if (!resourceCourseId) { toast.error("Please select a course"); return; }

    setIsUploading(true);
    try {
      const res = await fetch(`/api/courses/${resourceCourseId}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title: resourceTitle,
          resourceType: "link",
          externalUrl: resourceUrl,
          section: resourceSection || undefined,
          isPublished: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to add resource");
        return;
      }

      const saved: RawResource = await res.json();
      const courseName = courses?.find((c) => c.id === resourceCourseId)?.title || "";
      setResources((prev) => [mapResource(saved, resourceCourseId, courseName), ...prev]);
      toast.success("Resource added");
      setResourceTitle("");
      setResourceUrl("");
      setResourceSection("");
    } catch {
      toast.error("Failed to add resource");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!resourceCourseId) { toast.error("Please select a course first"); return; }

    setIsUploading(true);
    try {
      const filePath = `courses/${resourceCourseId}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from("course-resources")
        .upload(filePath, file, { upsert: false });

      if (error) throw error;

      const { data: publicData } = supabase.storage.from("course-resources").getPublicUrl(data.path);

      const title = resourceTitle || file.name;
      const res = await fetch(`/api/courses/${resourceCourseId}/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          title,
          resourceType: "file",
          fileUrl: publicData.publicUrl,
          section: resourceSection || undefined,
          isPublished: true,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save resource");
      }

      const saved: RawResource = await res.json();
      const courseName = courses?.find((c) => c.id === resourceCourseId)?.title || "";
      setResources((prev) => [mapResource(saved, resourceCourseId, courseName), ...prev]);
      toast.success("File uploaded successfully");
      setResourceTitle("");
      setResourceSection("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const removeResource = async (resource: Resource) => {
    const prev = resources;
    setResources((p) => p.filter((r) => r.id !== resource.id));
    try {
      const res = await fetch(`/api/courses/${resource.courseId}/resources/${resource.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("Resource removed");
    } catch {
      setResources(prev);
      toast.error("Failed to remove resource");
    }
  };

  const filteredResources =
    selectedCourseId === "all"
      ? resources
      : resources.filter((r) => r.courseId === selectedCourseId);

  const groupedResources = filteredResources.reduce<Record<string, Resource[]>>((acc, r) => {
    const key = r.section || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <TeacherLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/teacher">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Resources</h1>
          <p className="text-muted-foreground mt-1">
            Upload files and add links for students across all your courses.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Add Resource Panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add Resource</CardTitle>
                <CardDescription>Upload a file or add an external link for students.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Course</Label>
                  <Select value={resourceCourseId} onValueChange={setResourceCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course..." />
                    </SelectTrigger>
                    <SelectContent>
                      {courses?.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Resource Title</Label>
                  <Input
                    placeholder="e.g. Chapter 1 Reading"
                    value={resourceTitle}
                    onChange={(e) => setResourceTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Section (optional)</Label>
                  <Input
                    placeholder="e.g. Week 1, Unit 2..."
                    value={resourceSection}
                    onChange={(e) => setResourceSection(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={addType === "link" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAddType("link")}
                    className="flex-1"
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Link
                  </Button>
                  <Button
                    variant={addType === "file" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAddType("file")}
                    className="flex-1"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    File Upload
                  </Button>
                </div>

                {addType === "link" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label>URL</Label>
                      <Input
                        placeholder="https://..."
                        value={resourceUrl}
                        onChange={(e) => setResourceUrl(e.target.value)}
                        type="url"
                      />
                    </div>
                    <Button onClick={handleAddLink} disabled={isUploading} className="w-full">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Link
                    </Button>
                  </>
                ) : (
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    {isUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        <p className="text-sm text-muted-foreground">Uploading...</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">
                          {isDragging ? "Drop file here" : "Click or drag to upload"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, DOCX, PPTX, images, videos up to 50MB
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Course Filter */}
            {!isCoursesLoading && courses && courses.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Filter by Course</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <button
                    onClick={() => setSelectedCourseId("all")}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                      selectedCourseId === "all" && "bg-primary/5 font-medium"
                    )}
                  >
                    <div className="h-7 w-7 rounded bg-muted flex items-center justify-center shrink-0">
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-sm">All Courses</span>
                    <Badge variant="secondary" className="text-xs ml-auto">{resources.length}</Badge>
                  </button>
                  {courses.map((course) => {
                    const count = resources.filter((r) => r.courseId === course.id).length;
                    return (
                      <button
                        key={course.id}
                        onClick={() => setSelectedCourseId(selectedCourseId === course.id ? "all" : course.id)}
                        className={cn(
                          "w-full text-left flex items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors",
                          selectedCourseId === course.id && "bg-primary/5"
                        )}
                      >
                        <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <BookOpen className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{course.title}</div>
                          {course.code && <div className="text-xs text-muted-foreground">{course.code}</div>}
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Resources List */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {selectedCourseId === "all"
                  ? `All Resources (${resources.length})`
                  : `${courses?.find((c) => c.id === selectedCourseId)?.title || ""} Resources`}
              </h2>
              {selectedCourseId !== "all" && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedCourseId("all")}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Show All
                </Button>
              )}
            </div>

            {filteredResources.length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedResources).map(([section, sectionResources]) => (
                  <div key={section}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
                      {section}
                    </h3>
                    <Card>
                      <CardContent className="p-0">
                        {sectionResources.map((resource, i) => (
                          <div
                            key={resource.id}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
                              i < sectionResources.length - 1 && "border-b"
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                resource.type === "file"
                                  ? "bg-blue-100 dark:bg-blue-900/30"
                                  : "bg-green-100 dark:bg-green-900/30"
                              )}
                            >
                              {resource.type === "file" ? (
                                <FileText className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Link2 className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{resource.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground truncate">
                                  {resource.courseName}
                                </span>
                                <Badge variant="outline" className="text-xs py-0 capitalize">
                                  {resource.type}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => window.open(resource.url, "_blank")}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeResource(resource)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-16">
                  <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-base mb-2">No resources yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {selectedCourseId === "all"
                      ? "Use the form on the left to upload files or add links for your students."
                      : "No resources added for this course yet."}
                  </p>
                  {(isCoursesLoading || isLoadingResources) && (
                    <div className="mt-4 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                      ))}
                    </div>
                  )}
                  {!isCoursesLoading && courses && courses.length === 0 && (
                    <div className="mt-4 flex items-center gap-2 justify-center text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      You need to be assigned to a course first.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TeacherLayout>
  );
}
