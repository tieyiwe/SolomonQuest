import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Camera, Loader2, Save } from "lucide-react";

function getInitials(firstName?: string | null, lastName?: string | null) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
}

function roleLabel(role?: string | null) {
  if (!role) return "";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(init?.headers ?? {}),
    },
  });
}

function ProfileForm() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    authedFetch(`/api/users/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFirstName(data.firstName ?? data.first_name ?? "");
        setLastName(data.lastName ?? data.last_name ?? "");
        setBio(data.bio ?? "");
        setAvatarUrl(data.avatarUrl ?? data.avatar_url ?? "");
        setEmail(data.email ?? "");
      })
      .catch(() => toast.error("Failed to load your profile"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `avatars/${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("school-assets")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("school-assets").getPublicUrl(path);
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      const res = await authedFetch("/api/users/me/avatar", {
        method: "POST",
        body: JSON.stringify({ avatar_url: versionedUrl }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");

      setAvatarUrl(versionedUrl);
      toast.success("Profile picture updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to upload picture");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const res = await authedFetch(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstName, lastName, bio }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to save");
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "User";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Profile</h1>
        <p className="text-muted-foreground mt-0.5">Manage your personal information and profile picture.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Picture</CardTitle>
          <CardDescription>
            Defaults to your initials until you upload a photo (max 2 MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20 border-2 border-primary/20">
              <AvatarImage src={avatarUrl} alt={fullName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                {getInitials(firstName, lastName)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 disabled:opacity-60"
              title="Change profile picture"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{fullName}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
            {user?.role && (
              <Badge variant="outline" className="mt-1 capitalize">{roleLabel(user.role)}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} readOnly disabled className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell us a little about yourself..."
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyProfilePage() {
  const { user } = useAuth();

  if (user?.role === "admin" || user?.role === "super_admin") {
    return (
      <AdminLayout>
        <ProfileForm />
      </AdminLayout>
    );
  }
  if (user?.role === "teacher") {
    return (
      <TeacherLayout>
        <ProfileForm />
      </TeacherLayout>
    );
  }
  return (
    <StudentLayout>
      <ProfileForm />
    </StudentLayout>
  );
}
