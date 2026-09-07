import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Eye,
  Globe,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  School,
  Users,
  BookOpen,
  Award,
  Star,
  Clock,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeroSlide {
  id: string;
  image_url: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_url: string;
  overlay_color: string;
  overlay_opacity: number;
}

interface StatItem {
  id: string;
  icon: string;
  label: string;
  value: string;
}

interface FeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
}

interface Testimonial {
  id: string;
  name: string;
  role: string;
  quote: string;
  avatar_url: string;
}

interface Branding {
  logo_url: string;
  school_name: string;
  tagline: string;
  slug: string;
  banner_slides: HeroSlide[];
  hero_settings: {
    animation: "fade" | "slide" | "zoom" | "none";
    auto_advance: boolean;
    interval_seconds: number;
  };
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  heading_text_color: string;
  heading_font: string;
  body_font: string;
  border_radius: "sharp" | "rounded" | "pill";
  stats_visible: boolean;
  stats: StatItem[];
  features: FeatureItem[];
  testimonials: Testimonial[];
  show_announcement: boolean;
  announcement_text: string;
  announcement_bg_color: string;
  social_website: string;
  social_facebook: string;
  social_twitter: string;
  social_instagram: string;
  social_linkedin: string;
  social_youtube: string;
  custom_css: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HEADING_FONTS = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "Raleway",
];

const BODY_FONTS = [
  "Inter",
  "Open Sans",
  "Roboto",
  "Lato",
  "Source Sans Pro",
];

const STAT_ICONS = ["Users", "BookOpen", "Award", "Star", "Globe", "Clock"];

const FEATURE_ICONS = [
  "BookOpen", "Users", "Award", "Star", "Globe", "Clock",
  "Lightbulb", "Heart", "Shield", "Zap", "Target", "Layers",
];

const BORDER_RADIUS_OPTIONS: { value: "sharp" | "rounded" | "pill"; label: string; px: string; desc: string }[] = [
  { value: "sharp", label: "Sharp", px: "0px", desc: "Modern / Corporate" },
  { value: "rounded", label: "Rounded", px: "8px", desc: "Friendly" },
  { value: "pill", label: "Pill", px: "24px", desc: "Playful" },
];

const INTERVAL_OPTIONS = [3, 5, 7, 10];

const DEFAULT_BRANDING: Branding = {
  logo_url: "",
  school_name: "",
  tagline: "",
  slug: "",
  banner_slides: [
    {
      id: crypto.randomUUID(),
      image_url: "",
      title: "Welcome to Our School",
      subtitle: "Where Excellence Meets Innovation",
      cta_text: "Apply Now",
      cta_url: "/apply",
      overlay_color: "#000000",
      overlay_opacity: 40,
    },
  ],
  hero_settings: {
    animation: "fade",
    auto_advance: true,
    interval_seconds: 5,
  },
  primary_color: "#4f46e5",
  secondary_color: "#7c3aed",
  accent_color: "#f59e0b",
  heading_text_color: "#1f2937",
  heading_font: "Inter",
  body_font: "Inter",
  border_radius: "rounded",
  stats_visible: true,
  stats: [
    { id: crypto.randomUUID(), icon: "Users", label: "Students", value: "500+" },
    { id: crypto.randomUUID(), icon: "BookOpen", label: "Courses", value: "50+" },
    { id: crypto.randomUUID(), icon: "Award", label: "Awards", value: "20+" },
  ],
  features: [
    { id: crypto.randomUUID(), icon: "BookOpen", title: "World-Class Curriculum", description: "Comprehensive programs designed for excellence." },
    { id: crypto.randomUUID(), icon: "Users", title: "Expert Faculty", description: "Learn from experienced, passionate educators." },
  ],
  testimonials: [
    { id: crypto.randomUUID(), name: "Sarah K.", role: "Student", quote: "This school changed my life!", avatar_url: "" },
  ],
  show_announcement: false,
  announcement_text: "",
  announcement_bg_color: "#3b82f6",
  social_website: "",
  social_facebook: "",
  social_twitter: "",
  social_instagram: "",
  social_linkedin: "",
  social_youtube: "",
  custom_css: "",
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

// ─── Icon renderer ────────────────────────────────────────────────────────────

function IconDisplay({ name, className = "w-5 h-5" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    Users: <Users className={className} />,
    BookOpen: <BookOpen className={className} />,
    Award: <Award className={className} />,
    Star: <Star className={className} />,
    Globe: <Globe className={className} />,
    Clock: <Clock className={className} />,
  };
  return <>{icons[name] || <Star className={className} />}</>;
}

// ─── Color Picker Row ─────────────────────────────────────────────────────────

function ColorPickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <label className="text-sm font-medium w-44 shrink-0 text-gray-700">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded cursor-pointer border border-gray-200"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 font-mono text-sm"
        maxLength={7}
      />
    </div>
  );
}

// ─── Slug availability check ──────────────────────────────────────────────────

function SlugField({
  value,
  schoolId,
  onChange,
}: {
  value: string;
  schoolId: string;
  onChange: (v: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSlug = useCallback(
    async (slug: string) => {
      if (!slug) { setStatus("idle"); return; }
      setStatus("checking");
      try {
        const res = await apiFetch(`/api/schools/slug-check?slug=${encodeURIComponent(slug)}&exclude=${schoolId}`);
        const data = await res.json();
        setStatus(data.available ? "available" : "taken");
      } catch {
        setStatus("idle");
      }
    },
    [schoolId]
  );

  const handleChange = (v: string) => {
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => checkSlug(v), 600);
  };

  return (
    <div>
      <Label className="text-sm font-medium text-gray-700 mb-1 block">URL Slug</Label>
      <div className="flex items-center gap-2">
        <div className="text-sm text-gray-500 whitespace-nowrap">solomonquest.app/schools/</div>
        <div className="relative flex-1">
          <Input
            value={value}
            onChange={(e) => handleChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="my-school"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {status === "checking" && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            {status === "available" && <span className="text-green-500 text-lg">✓</span>}
            {status === "taken" && <span className="text-red-500 text-lg">✗</span>}
          </div>
        </div>
      </div>
      {status === "available" && <p className="text-xs text-green-600 mt-1">Slug is available!</p>}
      {status === "taken" && <p className="text-xs text-red-500 mt-1">This slug is already taken.</p>}
    </div>
  );
}

// ─── Logo Upload ──────────────────────────────────────────────────────────────

function LogoUploadButton({ onUploaded, schoolId }: { onUploaded: (url: string) => void; schoolId?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("File must be under 2 MB"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `school-logos/${schoolId}/logo.${ext}`;
      const { error } = await supabase.storage.from("school-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("school-assets").getPublicUrl(path);
      onUploaded(publicUrl + `?v=${Date.now()}`);
      toast.success("Logo uploaded!");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading || !schoolId}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
        {uploading ? "Uploading…" : "Upload Logo"}
      </Button>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DnsRecord {
  type: string;
  host: string;
  value: string;
  note: string;
}

type DomainStatus = "unset" | "requested" | "approved" | "verified" | "failed";

function DomainTab({ schoolId }: { schoolId: string }) {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<DomainStatus>("unset");
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(() => {
    if (!schoolId) return;
    apiFetch(`/api/schools/${schoolId}/custom-domain`)
      .then((r) => r.json())
      .then((data) => {
        setDomain(data.domain ?? "");
        setStatus((data.status as DomainStatus) ?? "unset");
        setDnsRecords(data.dnsRecords ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmitRequest = async () => {
    if (!domain.trim()) {
      toast.error("Enter a domain first, e.g. school.edu");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/custom-domain/request`, {
        method: "POST",
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit domain request");
      setStatus("requested");
      toast.success("Domain request submitted — we'll notify you once it's approved");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit domain request");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/custom-domain/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.verified) throw new Error(data.error || "Verification failed");
      setStatus("verified");
      toast.success("Domain verified! Your custom domain is now connected.");
    } catch (err: any) {
      setStatus("failed");
      toast.error(err.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/custom-domain`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect domain");
      setDomain("");
      setStatus("unset");
      setDnsRecords([]);
      toast.success("Custom domain disconnected");
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect domain");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-400">Loading…</div>;
  }

  const statusBadge = {
    unset: null,
    requested: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">Awaiting platform approval</span>,
    approved: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">Approved — add DNS records</span>,
    verified: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">Connected</span>,
    failed: <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Verification failed</span>,
  }[status];

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-1 block">Your domain</Label>
        <p className="text-xs text-gray-500 mb-3">
          Use your own domain (e.g. <code className="bg-gray-100 px-1 rounded font-mono">school.edu</code>) instead of the
          shared SolomonQuest URL for your school's public page.
        </p>
        <div className="flex items-center gap-2">
          <Input
            placeholder="school.edu"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            disabled={status === "requested" || status === "verified"}
            className="max-w-xs"
          />
          {statusBadge}
        </div>
      </div>

      {(status === "unset" || status === "failed") && (
        <Button onClick={handleSubmitRequest} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Domain for Verification
        </Button>
      )}

      {status === "requested" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            Your request to connect <strong>{domain}</strong> has been submitted to the platform team. You'll get a
            notification here (and by email) once it's approved and ready for you to add the DNS records.
          </p>
        </div>
      )}

      {(status === "approved" || status === "failed") && dnsRecords.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
          <p className="text-sm font-medium text-gray-800">Add these DNS records at your domain registrar</p>
          <ol className="text-sm text-gray-600 space-y-3 list-decimal list-inside">
            <li>
              Log in to wherever you manage DNS for <strong>{domain}</strong> (e.g. GoDaddy, Namecheap, Cloudflare,
              Google Domains).
            </li>
            <li>Add the two records below exactly as shown.</li>
            <li>DNS changes can take anywhere from a few minutes to a few hours to take effect.</li>
            <li>Come back here and click "Verify" — once both records are visible, your domain goes live.</li>
          </ol>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Host / Name</th>
                  <th className="py-2 pr-4 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {dnsRecords.map((rec, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 font-mono">{rec.type}</td>
                    <td className="py-2 pr-4 font-mono break-all">{rec.host}</td>
                    <td className="py-2 pr-4 font-mono break-all">{rec.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={handleVerify} disabled={verifying} variant="outline">
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify DNS Records
          </Button>
        </div>
      )}

      {status === "verified" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
          <p className="text-sm text-green-800">
            <strong>{domain}</strong> is connected and verified. Visitors to this domain will see your school's public
            page.
          </p>
          <Button onClick={handleDisconnect} disabled={saving} variant="outline" size="sm">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Disconnect Domain
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminSchoolBranding() {
  const { user } = useAuth();
  const schoolId = (user?.schoolId ?? (user as any)?.school_id) || "";

  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingSlide, setAddingSlide] = useState(false);
  const [newSlide, setNewSlide] = useState<Omit<HeroSlide, "id">>({
    image_url: "",
    title: "",
    subtitle: "",
    cta_text: "Apply Now",
    cta_url: "",
    overlay_color: "#000000",
    overlay_opacity: 40,
  });

  // Fetch existing branding on mount
  useEffect(() => {
    if (!schoolId) return;
    apiFetch("/api/schools/my")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          // Prefer branding JSONB if available, otherwise fall back to individual columns
          const b = (data.branding && typeof data.branding === "object" && Object.keys(data.branding as object).length > 0)
            ? data.branding as Record<string, unknown>
            : null;
          setBranding((prev) => ({
            ...prev,
            ...(b ?? {}),
            school_name: (data.name as string) ?? prev.school_name,
            slug: (b?.slug as string) ?? (data.slug as string) ?? prev.slug,
            logo_url: (b?.logo_url as string) ?? (data.logo_url as string) ?? (data.logoUrl as string) ?? prev.logo_url,
            tagline: (b?.tagline as string) ?? (data.tagline as string) ?? prev.tagline,
            primary_color: (b?.primary_color as string) ?? (data.primary_color as string) ?? (data.primaryColor as string) ?? prev.primary_color,
            secondary_color: (b?.secondary_color as string) ?? (data.secondary_color as string) ?? (data.secondaryColor as string) ?? prev.secondary_color,
            accent_color: (b?.accent_color as string) ?? (data.accent_color as string) ?? prev.accent_color,
            heading_font: (b?.heading_font as string) ?? (data.heading_font as string) ?? prev.heading_font,
            heading_text_color: (b?.heading_text_color as string) ?? (data.heading_color as string) ?? prev.heading_text_color,
            body_font: (b?.body_font as string) ?? (data.body_font as string) ?? prev.body_font,
            border_radius: (b?.border_radius as "sharp" | "rounded" | "pill") ?? (data.border_radius as "sharp" | "rounded" | "pill") ?? prev.border_radius,
            banner_slides: (b?.banner_slides as HeroSlide[]) ?? (data.banner_slides as HeroSlide[]) ?? prev.banner_slides,
            stats_visible: (b?.stats_visible as boolean) ?? (data.stats_visible as boolean) ?? prev.stats_visible,
            stats: (b?.stats as StatItem[]) ?? (data.stats as StatItem[]) ?? prev.stats,
            features: (b?.features as FeatureItem[]) ?? (data.features_section as FeatureItem[]) ?? prev.features,
            testimonials: (b?.testimonials as Testimonial[]) ?? (data.testimonials as Testimonial[]) ?? prev.testimonials,
            show_announcement: (b?.show_announcement as boolean) ?? (data.show_announcement as boolean) ?? prev.show_announcement,
            announcement_text: (b?.announcement_text as string) ?? (data.announcement_banner as string) ?? prev.announcement_text,
            announcement_bg_color: (b?.announcement_bg_color as string) ?? (data.announcement_color as string) ?? prev.announcement_bg_color,
            social_facebook: (b?.social_facebook as string) ?? ((data.social_links as Record<string, string>)?.facebook) ?? prev.social_facebook,
            social_twitter: (b?.social_twitter as string) ?? ((data.social_links as Record<string, string>)?.twitter) ?? prev.social_twitter,
            social_instagram: (b?.social_instagram as string) ?? ((data.social_links as Record<string, string>)?.instagram) ?? prev.social_instagram,
            social_linkedin: (b?.social_linkedin as string) ?? ((data.social_links as Record<string, string>)?.linkedin) ?? prev.social_linkedin,
            social_youtube: (b?.social_youtube as string) ?? ((data.social_links as Record<string, string>)?.youtube) ?? prev.social_youtube,
            social_website: (b?.social_website as string) ?? ((data.social_links as Record<string, string>)?.website) ?? prev.social_website,
            custom_css: (b?.custom_css as string) ?? (data.custom_css as string) ?? prev.custom_css,
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  const update = useCallback(<K extends keyof Branding>(field: K, value: Branding[K]) => {
    setBranding((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/schools/${schoolId}/branding`, {
        method: "PUT",
        body: JSON.stringify(branding),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Branding saved successfully!");
      } else {
        toast.error(json?.error ?? `Save failed (${res.status})`);
      }
    } catch {
      toast.error("Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  // ── Slide helpers ──
  const moveSlide = (idx: number, dir: -1 | 1) => {
    const slides = [...branding.banner_slides];
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    [slides[idx], slides[target]] = [slides[target], slides[idx]];
    update("banner_slides", slides);
  };

  const deleteSlide = (idx: number) => {
    if (branding.banner_slides.length <= 1) {
      toast.error("You must have at least 1 slide.");
      return;
    }
    update("banner_slides", branding.banner_slides.filter((_, i) => i !== idx));
  };

  const addSlide = () => {
    if (branding.banner_slides.length >= 6) {
      toast.error("Maximum 6 slides allowed.");
      return;
    }
    update("banner_slides", [
      ...branding.banner_slides,
      { ...newSlide, id: crypto.randomUUID() },
    ]);
    setNewSlide({ image_url: "", title: "", subtitle: "", cta_text: "Apply Now", cta_url: "", overlay_color: "#000000", overlay_opacity: 40 });
    setAddingSlide(false);
  };

  // ── Stat helpers ──
  const addStat = () => {
    if (branding.stats.length >= 6) { toast.error("Max 6 stats."); return; }
    update("stats", [...branding.stats, { id: crypto.randomUUID(), icon: "Users", label: "", value: "" }]);
  };
  const updateStat = (idx: number, field: keyof StatItem, value: string) => {
    const stats = branding.stats.map((s, i) => i === idx ? { ...s, [field]: value } : s);
    update("stats", stats);
  };
  const deleteStat = (idx: number) => update("stats", branding.stats.filter((_, i) => i !== idx));

  // ── Feature helpers ──
  const addFeature = () => {
    if (branding.features.length >= 6) { toast.error("Max 6 features."); return; }
    update("features", [...branding.features, { id: crypto.randomUUID(), icon: "BookOpen", title: "", description: "" }]);
  };
  const updateFeature = (idx: number, field: keyof FeatureItem, value: string) => {
    const features = branding.features.map((f, i) => i === idx ? { ...f, [field]: value } : f);
    update("features", features);
  };
  const deleteFeature = (idx: number) => update("features", branding.features.filter((_, i) => i !== idx));

  // ── Testimonial helpers ──
  const addTestimonial = () => {
    if (branding.testimonials.length >= 4) { toast.error("Max 4 testimonials."); return; }
    update("testimonials", [...branding.testimonials, { id: crypto.randomUUID(), name: "", role: "", quote: "", avatar_url: "" }]);
  };
  const updateTestimonial = (idx: number, field: keyof Testimonial, value: string) => {
    const testimonials = branding.testimonials.map((t, i) => i === idx ? { ...t, [field]: value } : t);
    update("testimonials", testimonials);
  };
  const deleteTestimonial = (idx: number) => update("testimonials", branding.testimonials.filter((_, i) => i !== idx));

  const borderRadiusValue = branding.border_radius === "sharp" ? "0px" : branding.border_radius === "rounded" ? "8px" : "24px";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="ml-3 text-gray-600">Loading branding settings...</span>
      </div>
    );
  }

  // ── Preview first slide ──
  const firstSlide = branding.banner_slides[0];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ── LEFT PANEL (60%) ── */}
      <div className="w-[60%] flex flex-col h-full border-r border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">School Branding</h1>
              <p className="text-sm text-gray-500">Customize your school's public page</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {branding.slug && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/schools/${branding.slug}`, "_blank")}
              >
                <Eye className="w-4 h-4 mr-1" />
                Preview Live
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {saving ? "Saving..." : "Save Branding"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="identity" className="h-full">
            <div className="px-6 pt-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <TabsList className="flex flex-wrap gap-1 h-auto bg-gray-100 p-1">
                <TabsTrigger value="identity" className="text-xs">Identity</TabsTrigger>
                <TabsTrigger value="hero" className="text-xs">Hero Banner</TabsTrigger>
                <TabsTrigger value="colors" className="text-xs">Colors & Fonts</TabsTrigger>
                <TabsTrigger value="sections" className="text-xs">Sections</TabsTrigger>
                <TabsTrigger value="announcement" className="text-xs">Announcement</TabsTrigger>
                <TabsTrigger value="social" className="text-xs">Social & Links</TabsTrigger>
                <TabsTrigger value="css" className="text-xs">Custom CSS</TabsTrigger>
                <TabsTrigger value="domain" className="text-xs">Custom Domain</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 space-y-6">

              {/* ── TAB 1: Identity ── */}
              <TabsContent value="identity" className="space-y-6 mt-0">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">School Logo</Label>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
                      {branding.logo_url ? (
                        <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <School className="w-10 h-10 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <LogoUploadButton
                        onUploaded={(url) => update("logo_url", url)}
                        schoolId={schoolId}
                      />
                      {branding.logo_url && (
                        <button
                          type="button"
                          onClick={() => update("logo_url", "")}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove logo
                        </button>
                      )}
                      <p className="text-xs text-gray-400">PNG, JPG or SVG. Max 2 MB.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1 block">School Name</Label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-700 text-sm">
                    {branding.school_name || "—"}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">School name is managed by your account settings.</p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1 block">Tagline</Label>
                  <Input
                    placeholder="Empowering minds, shaping futures"
                    value={branding.tagline}
                    onChange={(e) => update("tagline", e.target.value)}
                  />
                </div>

                <SlugField
                  value={branding.slug}
                  schoolId={schoolId}
                  onChange={(v) => update("slug", v)}
                />
              </TabsContent>

              {/* ── TAB 2: Hero Banner ── */}
              <TabsContent value="hero" className="space-y-6 mt-0">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold text-gray-700">Slides ({branding.banner_slides.length}/6)</Label>
                    {branding.banner_slides.length < 6 && (
                      <Button size="sm" variant="outline" onClick={() => setAddingSlide((v) => !v)}>
                        <Plus className="w-4 h-4 mr-1" /> Add Slide
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {branding.banner_slides.map((slide, idx) => (
                      <div key={slide.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="w-10 h-10 rounded overflow-hidden bg-gray-200 shrink-0">
                          {slide.image_url ? (
                            <img src={slide.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">IMG</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{slide.title || "Untitled Slide"}</p>
                          <p className="text-xs text-gray-500 truncate">{slide.subtitle}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => moveSlide(idx, 1)} disabled={idx === branding.banner_slides.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteSlide(idx)} className="p-1 text-red-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {addingSlide && (
                    <div className="mt-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50 space-y-3">
                      <h3 className="text-sm font-semibold text-indigo-900">New Slide</h3>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1 block">Image URL</Label>
                        <Input
                          placeholder="https://example.com/hero.jpg"
                          value={newSlide.image_url}
                          onChange={(e) => setNewSlide((p) => ({ ...p, image_url: e.target.value }))}
                        />
                        {newSlide.image_url && (
                          <img src={newSlide.image_url} alt="" className="mt-2 h-20 rounded object-cover w-full" />
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">Title</Label>
                          <Input
                            placeholder="Welcome to Springfield Academy"
                            value={newSlide.title}
                            onChange={(e) => setNewSlide((p) => ({ ...p, title: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">Subtitle</Label>
                          <Input
                            placeholder="Where Excellence Meets Innovation"
                            value={newSlide.subtitle}
                            onChange={(e) => setNewSlide((p) => ({ ...p, subtitle: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">CTA Button Text</Label>
                          <Input
                            placeholder="Apply Now"
                            value={newSlide.cta_text}
                            onChange={(e) => setNewSlide((p) => ({ ...p, cta_text: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">CTA URL</Label>
                          <Input
                            placeholder="/schools/springfield/apply"
                            value={newSlide.cta_url}
                            onChange={(e) => setNewSlide((p) => ({ ...p, cta_url: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">Overlay Color</Label>
                          <input
                            type="color"
                            value={newSlide.overlay_color}
                            onChange={(e) => setNewSlide((p) => ({ ...p, overlay_color: e.target.value }))}
                            className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-gray-600 mb-1 block">Overlay Opacity: {newSlide.overlay_opacity}%</Label>
                          <input
                            type="range"
                            min={0}
                            max={80}
                            value={newSlide.overlay_opacity}
                            onChange={(e) => setNewSlide((p) => ({ ...p, overlay_opacity: Number(e.target.value) }))}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setAddingSlide(false)}>Cancel</Button>
                        <Button size="sm" onClick={addSlide} className="bg-indigo-600 hover:bg-indigo-700 text-white">Add Slide</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-1 block">Hero Animation</Label>
                    <select
                      value={branding.hero_settings.animation}
                      onChange={(e) => update("hero_settings", { ...branding.hero_settings, animation: e.target.value as "fade" | "slide" | "zoom" | "none" })}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="fade">Fade (crossfade between slides)</option>
                      <option value="slide">Slide (slides left/right)</option>
                      <option value="zoom">Zoom (zoom in on each slide)</option>
                      <option value="none">None (static first slide)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={branding.hero_settings.auto_advance}
                        onCheckedChange={(v) => update("hero_settings", { ...branding.hero_settings, auto_advance: v })}
                      />
                      <Label className="text-sm text-gray-700">Auto-advance slides</Label>
                    </div>
                    {branding.hero_settings.auto_advance && (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-gray-600 whitespace-nowrap">Interval:</Label>
                        <select
                          value={branding.hero_settings.interval_seconds}
                          onChange={(e) => update("hero_settings", { ...branding.hero_settings, interval_seconds: Number(e.target.value) })}
                          className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                          {INTERVAL_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}s</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB 3: Colors & Fonts ── */}
              <TabsContent value="colors" className="space-y-6 mt-0">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Brand Colors</h3>
                  <ColorPickerRow label="Primary Color" value={branding.primary_color} onChange={(v) => update("primary_color", v)} />
                  <ColorPickerRow label="Secondary Color" value={branding.secondary_color} onChange={(v) => update("secondary_color", v)} />
                  <ColorPickerRow label="Accent Color" value={branding.accent_color} onChange={(v) => update("accent_color", v)} />
                  <ColorPickerRow label="Heading Text Color" value={branding.heading_text_color} onChange={(v) => update("heading_text_color", v)} />
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Typography</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-gray-600 mb-1 block">Heading Font</Label>
                      <select
                        value={branding.heading_font}
                        onChange={(e) => update("heading_font", e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {HEADING_FONTS.map((f) => (
                          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: branding.heading_font }}>Preview: {branding.heading_font}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-gray-600 mb-1 block">Body Font</Label>
                      <select
                        value={branding.body_font}
                        onChange={(e) => update("body_font", e.target.value)}
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {BODY_FONTS.map((f) => (
                          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-400 mt-1" style={{ fontFamily: branding.body_font }}>Preview: {branding.body_font}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Border Radius Style</h3>
                  <div className="flex gap-3">
                    {BORDER_RADIUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update("border_radius", opt.value)}
                        className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 rounded-lg transition-all ${
                          branding.border_radius === opt.value
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <div
                          className="w-12 h-8 bg-indigo-500 flex items-center justify-center text-white text-xs font-medium"
                          style={{ borderRadius: opt.px }}
                        >
                          Btn
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-semibold text-gray-700">{opt.label}</p>
                          <p className="text-xs text-gray-400">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB 4: Sections ── */}
              <TabsContent value="sections" className="space-y-6 mt-0">
                {/* Stats */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={branding.stats_visible}
                        onCheckedChange={(v) => update("stats_visible", v)}
                      />
                      <Label className="text-sm font-semibold text-gray-700">Stats Section</Label>
                    </div>
                    {branding.stats.length < 6 && (
                      <Button size="sm" variant="outline" onClick={addStat}>
                        <Plus className="w-4 h-4 mr-1" /> Add Stat
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {branding.stats.map((stat, idx) => (
                      <div key={stat.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg">
                        <select
                          value={stat.icon}
                          onChange={(e) => updateStat(idx, "icon", e.target.value)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        >
                          {STAT_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                        <Input
                          placeholder="Label (e.g. Students)"
                          value={stat.label}
                          onChange={(e) => updateStat(idx, "label", e.target.value)}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Value (e.g. 500+)"
                          value={stat.value}
                          onChange={(e) => updateStat(idx, "value", e.target.value)}
                          className="text-xs w-24"
                        />
                        <button onClick={() => deleteStat(idx)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold text-gray-700">Features Section</Label>
                    {branding.features.length < 6 && (
                      <Button size="sm" variant="outline" onClick={addFeature}>
                        <Plus className="w-4 h-4 mr-1" /> Add Feature
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {branding.features.map((feat, idx) => (
                      <div key={feat.id} className="p-3 border border-gray-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={feat.icon}
                            onChange={(e) => updateFeature(idx, "icon", e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          >
                            {FEATURE_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                          </select>
                          <Input
                            placeholder="Feature title"
                            value={feat.title}
                            onChange={(e) => updateFeature(idx, "title", e.target.value)}
                            className="text-xs"
                          />
                          <button onClick={() => deleteFeature(idx)} className="text-red-400 hover:text-red-600 shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <Textarea
                          placeholder="Feature description..."
                          value={feat.description}
                          onChange={(e) => updateFeature(idx, "description", e.target.value)}
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Testimonials */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold text-gray-700">Testimonials Section</Label>
                    {branding.testimonials.length < 4 && (
                      <Button size="sm" variant="outline" onClick={addTestimonial}>
                        <Plus className="w-4 h-4 mr-1" /> Add Testimonial
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {branding.testimonials.map((t, idx) => (
                      <div key={t.id} className="p-3 border border-gray-200 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Name"
                            value={t.name}
                            onChange={(e) => updateTestimonial(idx, "name", e.target.value)}
                            className="text-xs"
                          />
                          <Input
                            placeholder="Role (e.g. Student)"
                            value={t.role}
                            onChange={(e) => updateTestimonial(idx, "role", e.target.value)}
                            className="text-xs"
                          />
                          <button onClick={() => deleteTestimonial(idx)} className="text-red-400 hover:text-red-600 shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <Textarea
                          placeholder="Quote..."
                          value={t.quote}
                          onChange={(e) => updateTestimonial(idx, "quote", e.target.value)}
                          rows={2}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Avatar URL (optional)"
                          value={t.avatar_url}
                          onChange={(e) => updateTestimonial(idx, "avatar_url", e.target.value)}
                          className="text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* ── TAB 5: Announcement ── */}
              <TabsContent value="announcement" className="space-y-4 mt-0">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={branding.show_announcement}
                    onCheckedChange={(v) => update("show_announcement", v)}
                  />
                  <Label className="text-sm font-medium text-gray-700">Show Announcement Banner</Label>
                </div>

                {branding.show_announcement && (
                  <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div>
                      <Label className="text-sm text-gray-600 mb-1 block">
                        Banner Text ({branding.announcement_text.length}/200)
                      </Label>
                      <Textarea
                        placeholder="Important announcement for students and parents..."
                        value={branding.announcement_text}
                        onChange={(e) => update("announcement_text", e.target.value.slice(0, 200))}
                        rows={3}
                      />
                    </div>
                    <ColorPickerRow
                      label="Background Color"
                      value={branding.announcement_bg_color}
                      onChange={(v) => update("announcement_bg_color", v)}
                    />
                    <div>
                      <Label className="text-sm text-gray-600 mb-2 block">Preview</Label>
                      <div
                        className="px-4 py-2 text-white text-sm rounded-md text-center"
                        style={{ backgroundColor: branding.announcement_bg_color }}
                      >
                        {branding.announcement_text || "Your announcement text will appear here."}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── TAB 6: Social & Links ── */}
              <TabsContent value="social" className="space-y-4 mt-0">
                {[
                  { key: "social_website", label: "Website URL", icon: <Globe className="w-4 h-4" />, placeholder: "https://yourschool.edu" },
                  { key: "social_facebook", label: "Facebook URL", icon: <Facebook className="w-4 h-4" />, placeholder: "https://facebook.com/yourschool" },
                  { key: "social_twitter", label: "Twitter / X URL", icon: <Twitter className="w-4 h-4" />, placeholder: "https://twitter.com/yourschool" },
                  { key: "social_instagram", label: "Instagram URL", icon: <Instagram className="w-4 h-4" />, placeholder: "https://instagram.com/yourschool" },
                  { key: "social_linkedin", label: "LinkedIn URL", icon: <Linkedin className="w-4 h-4" />, placeholder: "https://linkedin.com/school/yourschool" },
                  { key: "social_youtube", label: "YouTube URL", icon: <Youtube className="w-4 h-4" />, placeholder: "https://youtube.com/@yourschool" },
                ].map(({ key, label, icon, placeholder }) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center text-gray-400 shrink-0">{icon}</div>
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 mb-1 block">{label}</Label>
                      <Input
                        placeholder={placeholder}
                        value={branding[key as keyof Branding] as string}
                        onChange={(e) => update(key as keyof Branding, e.target.value as never)}
                      />
                    </div>
                  </div>
                ))}
              </TabsContent>

              {/* ── TAB 7: Custom CSS ── */}
              <TabsContent value="css" className="space-y-4 mt-0">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-1 block">Custom CSS</Label>
                  <div className="flex items-start gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                    <p className="text-xs text-amber-800 font-medium">
                      <strong>For developers only.</strong> If you are not a developer, do not add anything here — incorrect CSS can break your school's public page appearance.
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    This CSS is injected into your school's public page.
                    Hint: Use <code className="bg-gray-100 px-1 rounded text-xs font-mono">:root {"{ --custom-bg: #fff; }"}</code> to override CSS variables.
                  </p>
                  <Textarea
                    value={branding.custom_css}
                    onChange={(e) => update("custom_css", e.target.value)}
                    rows={16}
                    placeholder={`:root {\n  --primary: #4f46e5;\n  --custom-bg: #ffffff;\n}\n\n.school-header {\n  /* custom styles */\n}`}
                    className="font-mono text-sm text-gray-800 bg-gray-900 text-green-400 border-gray-700 resize-y"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  />
                </div>
              </TabsContent>

              <TabsContent value="domain" className="space-y-4 mt-0">
                <DomainTab schoolId={schoolId} />
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </div>

      {/* ── RIGHT PANEL (40%): Live Preview ── */}
      <div className="w-[40%] flex flex-col h-full bg-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 bg-gray-100 rounded px-3 py-1 text-xs text-gray-500 font-mono ml-2">
            solomonquest.app/schools/{branding.slug || "your-school"}
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            fontFamily: branding.body_font || "Inter",
          }}
        >
          {/* Announcement bar */}
          {branding.show_announcement && branding.announcement_text && (
            <div
              className="px-4 py-2 text-white text-xs text-center"
              style={{ backgroundColor: branding.announcement_bg_color }}
            >
              {branding.announcement_text}
            </div>
          )}

          {/* Mini nav */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: branding.primary_color }}>
            <div className="flex items-center gap-2">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
              ) : (
                <School className="w-6 h-6 text-white" />
              )}
              <span className="text-white text-sm font-bold" style={{ fontFamily: branding.heading_font }}>
                {branding.school_name || "School Name"}
              </span>
            </div>
            <div className="flex gap-3 text-white text-xs opacity-80">
              <span>About</span>
              <span>Courses</span>
              <span>Contact</span>
            </div>
          </div>

          {/* Hero section */}
          <div
            className="relative h-48 flex items-center justify-center text-white overflow-hidden"
            style={{
              backgroundImage: firstSlide?.image_url ? `url(${firstSlide.image_url})` : undefined,
              backgroundColor: firstSlide?.image_url ? undefined : branding.primary_color,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {firstSlide?.image_url && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: firstSlide.overlay_color,
                  opacity: firstSlide.overlay_opacity / 100,
                }}
              />
            )}
            <div className="relative z-10 text-center px-4">
              <h1
                className="text-lg font-bold mb-1 drop-shadow"
                style={{ fontFamily: branding.heading_font, color: branding.heading_text_color === "#1f2937" ? "white" : branding.heading_text_color }}
              >
                {firstSlide?.title || "Welcome to Our School"}
              </h1>
              <p className="text-xs mb-3 opacity-90">{firstSlide?.subtitle}</p>
              {firstSlide?.cta_text && (
                <button
                  className="px-4 py-1.5 text-white text-xs font-semibold"
                  style={{
                    backgroundColor: branding.accent_color,
                    borderRadius: borderRadiusValue,
                  }}
                >
                  {firstSlide.cta_text}
                </button>
              )}
              <div className="mt-2">
                <span className="text-xs opacity-60 bg-black/30 px-2 py-0.5 rounded">
                  Animation: {branding.hero_settings.animation}
                  {branding.hero_settings.auto_advance ? ` · auto ${branding.hero_settings.interval_seconds}s` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Tagline band */}
          {branding.tagline && (
            <div
              className="py-3 text-center text-xs font-medium text-white"
              style={{ backgroundColor: branding.secondary_color }}
            >
              {branding.tagline}
            </div>
          )}

          {/* Stats row */}
          {branding.stats_visible && branding.stats.length > 0 && (
            <div className="px-4 py-4 bg-white">
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(branding.stats.length, 3)}, 1fr)` }}>
                {branding.stats.map((stat) => (
                  <div key={stat.id} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-gray-50">
                    <div style={{ color: branding.primary_color }}>
                      <IconDisplay name={stat.icon} className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold" style={{ color: branding.primary_color, fontFamily: branding.heading_font }}>
                      {stat.value}
                    </span>
                    <span className="text-xs text-gray-500">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Features grid */}
          {branding.features.length > 0 && (
            <div className="px-4 py-4 bg-gray-50">
              <h2 className="text-sm font-bold mb-3" style={{ color: branding.heading_text_color, fontFamily: branding.heading_font }}>
                Features
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {branding.features.map((feat) => (
                  <div
                    key={feat.id}
                    className="p-3 bg-white rounded-lg shadow-sm border border-gray-100"
                    style={{ borderRadius: borderRadiusValue }}
                  >
                    <div className="mb-1" style={{ color: branding.primary_color }}>
                      <IconDisplay name={feat.icon} className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-gray-800 mb-0.5" style={{ fontFamily: branding.heading_font }}>
                      {feat.title || "Feature Title"}
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{feat.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Testimonials */}
          {branding.testimonials.length > 0 && (
            <div className="px-4 py-4 bg-white">
              <h2 className="text-sm font-bold mb-3" style={{ color: branding.heading_text_color, fontFamily: branding.heading_font }}>
                Testimonials
              </h2>
              <div className="space-y-2">
                {branding.testimonials.map((t) => (
                  <div key={t.id} className="p-3 rounded-lg border border-gray-100 bg-gray-50" style={{ borderRadius: borderRadiusValue }}>
                    <p className="text-xs text-gray-600 italic mb-2">"{t.quote || "Testimonial quote..."}"</p>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: branding.primary_color }}
                      >
                        {t.avatar_url ? (
                          <img src={t.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          (t.name?.[0] || "?")
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{t.name || "Name"}</p>
                        <p className="text-xs text-gray-400">{t.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-4" style={{ backgroundColor: branding.primary_color }}>
            <div className="flex items-center justify-center gap-3 mb-2">
              {branding.social_website && (
                <Globe className="w-4 h-4 text-white opacity-80" />
              )}
              {branding.social_facebook && (
                <Facebook className="w-4 h-4 text-white opacity-80" />
              )}
              {branding.social_twitter && (
                <Twitter className="w-4 h-4 text-white opacity-80" />
              )}
              {branding.social_instagram && (
                <Instagram className="w-4 h-4 text-white opacity-80" />
              )}
              {branding.social_linkedin && (
                <Linkedin className="w-4 h-4 text-white opacity-80" />
              )}
              {branding.social_youtube && (
                <Youtube className="w-4 h-4 text-white opacity-80" />
              )}
            </div>
            <p className="text-center text-xs text-white opacity-60">
              {branding.school_name || "School Name"} · Powered by SolomonQuest
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
