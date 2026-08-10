import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BookOpen,
  Users,
  Award,
  Star,
  Globe,
  Clock,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
  ExternalLink,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BannerSlide {
  image_url: string;
  title: string;
  subtitle?: string;
  cta_label?: string;
  cta_url?: string;
  overlay_color?: string;
  overlay_opacity?: number;
}

interface Stat {
  icon?: string;
  value: string;
  label: string;
}

interface Feature {
  icon?: string;
  title: string;
  description: string;
}

interface Testimonial {
  quote: string;
  name: string;
  role?: string;
  avatar_url?: string;
}

interface SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  twitter?: string;
  website?: string;
}

interface HeroSettings {
  interval_seconds?: number;
}

interface Course {
  id: string | number;
  title: string;
  code?: string;
  description?: string;
  teacherName?: string;
  is_live?: boolean;
  class_date?: string;
  term?: string;
}

interface School {
  id: string | number;
  name: string;
  slug: string;
  logo_url?: string;
  logoUrl?: string;
  tagline?: string;
  primary_color?: string;
  primaryColor?: string;
  secondary_color?: string;
  secondaryColor?: string;
  accent_color?: string;
  heading_color?: string;
  headingColor?: string;
  heading_font?: string;
  headingFont?: string;
  body_font?: string;
  border_radius?: "sharp" | "rounded" | "pill";
  hero_animation?: "fade" | "slide" | "zoom" | "none";
  hero_settings?: HeroSettings;
  banner_slides?: BannerSlide[];
  stats_visible?: boolean;
  stats?: Stat[];
  features_section?: Feature[];
  features?: Feature[];
  testimonials?: Testimonial[];
  social_links?: SocialLinks;
  announcement_banner?: string;
  announcement_text?: string;
  show_announcement?: boolean;
  announcement_color?: string;
  announcement_bg_color?: string;
  custom_css?: string;
  customCss?: string;
  courses?: Course[];
  branding?: Record<string, unknown>;
  social_facebook?: string;
  social_instagram?: string;
  social_linkedin?: string;
  social_youtube?: string;
  social_twitter?: string;
  social_website?: string;
}

// ─── useScrollReveal hook ────────────────────────────────────────────────────

function useScrollReveal() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

// ─── useCountUp hook ─────────────────────────────────────────────────────────

function useCountUp(target: string, active: boolean) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!active) return;
    const num = parseFloat(target.replace(/[^0-9.]/g, ""));
    const suffix = target.replace(/[0-9.,]/g, "");
    if (isNaN(num)) {
      setDisplay(target);
      return;
    }
    const duration = 1500;
    const steps = 40;
    const step = num / steps;
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + step, num);
      setDisplay(
        Math.round(current).toLocaleString() + suffix
      );
      if (current >= num) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [active, target]);

  return display;
}

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ stat, primaryColor }: { stat: Stat; primaryColor: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const display = useCountUp(stat.value, visible);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const IconMap: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
    users: Users,
    award: Award,
    star: Star,
    book: BookOpen,
    clock: Clock,
    globe: Globe,
  };
  const IconComp = stat.icon ? IconMap[stat.icon.toLowerCase()] ?? BookOpen : BookOpen;

  return (
    <div ref={ref} className="reveal-el flex flex-col items-center gap-2 p-6">
      <IconComp size={36} color={primaryColor} />
      <span
        className="text-4xl font-bold"
        style={{ color: primaryColor }}
      >
        {display}
      </span>
      <span className="text-gray-600 text-sm text-center">{stat.label}</span>
    </div>
  );
}

// ─── HeroCarousel ────────────────────────────────────────────────────────────

function HeroCarousel({
  slides,
  animation,
  intervalSeconds,
  headingFont,
  primaryColor,
  secondaryColor,
  onApply,
}: {
  slides: BannerSlide[];
  animation: string;
  intervalSeconds: number;
  headingFont?: string;
  primaryColor: string;
  secondaryColor: string;
  onApply: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback(
    (index: number, dir: "left" | "right" = "right") => {
      setPrev(current);
      setDirection(dir);
      setCurrent(index);
    },
    [current]
  );

  const next = useCallback(() => {
    goTo((current + 1) % slides.length, "right");
  }, [current, slides.length, goTo]);

  const prev_ = useCallback(() => {
    goTo((current - 1 + slides.length) % slides.length, "left");
  }, [current, slides.length, goTo]);

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(next, intervalSeconds * 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [next, intervalSeconds, slides.length]);

  const getSlideStyle = (index: number): React.CSSProperties => {
    const isActive = index === current;
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      transition: "opacity 0.7s ease, transform 0.7s ease",
    };

    if (animation === "fade") {
      return { ...base, opacity: isActive ? 1 : 0 };
    }
    if (animation === "slide") {
      if (isActive) return { ...base, transform: "translateX(0)", opacity: 1 };
      if (index === prev)
        return {
          ...base,
          transform: direction === "right" ? "translateX(-100%)" : "translateX(100%)",
          opacity: 0,
        };
      return { ...base, opacity: 0, transform: "translateX(100%)" };
    }
    if (animation === "zoom") {
      return {
        ...base,
        opacity: isActive ? 1 : 0,
        animation: isActive ? "kenBurns 8s ease forwards" : "none",
      };
    }
    // none
    return { ...base, opacity: isActive ? 1 : 0, transition: "none" };
  };

  return (
    <div className="relative w-full h-[70vh] min-h-[480px] overflow-hidden bg-gray-900">
      {slides.map((slide, i) => {
        const overlayColor = slide.overlay_color ?? "#000000";
        const overlayOpacity = slide.overlay_opacity ?? 0.5;
        return (
          <div key={i} style={getSlideStyle(i)}>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${slide.image_url})` }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: overlayColor,
                opacity: overlayOpacity,
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
              <h1
                className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-xl"
                style={{
                  fontFamily: headingFont,
                  textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                }}
              >
                {slide.title}
              </h1>
              {slide.subtitle && (
                <p className="text-xl md:text-2xl text-white/80 mb-8 max-w-2xl drop-shadow">
                  {slide.subtitle}
                </p>
              )}
              {slide.cta_label && (
                <button
                  onClick={onApply}
                  className="px-8 py-3 rounded-lg font-semibold text-white text-lg shadow-lg hover:opacity-90 transition-opacity"
                  style={{ background: primaryColor }}
                >
                  {slide.cta_label}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prev_}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
          >
            <ChevronRight size={28} />
          </button>

          {/* Dots */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > current ? "right" : "left")}
                className="w-2.5 h-2.5 rounded-full transition-all"
                style={{
                  background: i === current ? "#ffffff" : "rgba(255,255,255,0.45)",
                  transform: i === current ? "scale(1.3)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function dashboardPathFor(role?: string | null): string {
  if (role === "admin" || role === "super_admin") return "/dashboard/admin";
  if (role === "teacher") return "/dashboard/teacher";
  return "/dashboard/student"; // staff and student share the student dashboard
}

export default function SchoolPublicPage() {
  const [, params] = useRoute("/schools/:slug");
  const slug = params?.slug ?? "";

  const { user } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch school + courses
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/schools/slug/${slug}`)
      .then((r) => r.json())
      .then((data: School) => {
        setSchool(data);
        return fetch(`/api/courses/public?school_id=${data.id}`);
      })
      .then((r) => r.json())
      .then((data: Course[]) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  // Derived values — prefer branding JSONB for rich fields, fall back to individual columns
  const b = school?.branding ?? {};
  const primaryColor = (b.primary_color as string) ?? school?.primary_color ?? school?.primaryColor ?? "#6366f1";
  const secondaryColor = (b.secondary_color as string) ?? school?.secondary_color ?? school?.secondaryColor ?? "#8b5cf6";
  const accentColor = (b.accent_color as string) ?? "#f59e0b";
  const headingFont = (b.heading_font as string) ?? school?.heading_font ?? school?.headingFont;
  const headingColor = (b.heading_text_color as string) ?? school?.heading_color ?? school?.headingColor;
  const bodyFont = (b.body_font as string) ?? school?.body_font;
  const borderRadius = (b.border_radius as string) ?? school?.border_radius ?? "rounded";
  const borderRadiusClass =
    borderRadius === "sharp" ? "rounded-none" : borderRadius === "pill" ? "rounded-3xl" : "rounded-xl";
  const heroAnimation = ((b.hero_settings as Record<string, unknown>)?.animation as string) ?? school?.hero_animation ?? "fade";
  const heroIntervalSeconds = ((b.hero_settings as Record<string, unknown>)?.interval_seconds as number) ?? 5;
  const logoUrl = (b.logo_url as string) ?? school?.logo_url ?? school?.logoUrl;
  const tagline = (b.tagline as string) ?? school?.tagline;
  const customCss = (b.custom_css as string) ?? school?.custom_css ?? school?.customCss;
  const showAnnouncement = (b.show_announcement as boolean) ?? school?.show_announcement ?? false;
  const announcementText = (b.announcement_text as string) ?? school?.announcement_banner ?? "";
  const announcementBgColor = (b.announcement_bg_color as string) ?? school?.announcement_color ?? primaryColor;

  const bannerSlides: BannerSlide[] = (b.banner_slides as BannerSlide[]) ?? school?.banner_slides ?? [];
  const statsVisible = (b.stats_visible as boolean) ?? school?.stats_visible ?? true;
  const stats: Stat[] = (b.stats as Stat[]) ?? school?.stats ?? [];
  const features: Feature[] = (b.features as Feature[]) ?? school?.features ?? school?.features_section ?? [];
  const testimonials: Testimonial[] = (b.testimonials as Testimonial[]) ?? school?.testimonials ?? [];
  const socialLinks: SocialLinks = {
    facebook: (b.social_facebook as string) || school?.social_facebook || (school?.social_links as SocialLinks)?.facebook,
    instagram: (b.social_instagram as string) || school?.social_instagram || (school?.social_links as SocialLinks)?.instagram,
    linkedin: (b.social_linkedin as string) || school?.social_linkedin || (school?.social_links as SocialLinks)?.linkedin,
    youtube: (b.social_youtube as string) || school?.social_youtube || (school?.social_links as SocialLinks)?.youtube,
    twitter: (b.social_twitter as string) || school?.social_twitter || (school?.social_links as SocialLinks)?.twitter,
    website: (b.social_website as string) || school?.social_website || (school?.social_links as SocialLinks)?.website,
  };

  const handleApply = () => {
    if (user) {
      window.location.href = `/schools/${slug}/apply`;
    } else {
      setShowAuthDialog(true);
    }
  };

  // Reveal refs
  const statsRef = useScrollReveal();
  const coursesRef = useScrollReveal();
  const featuresRef = useScrollReveal();
  const testimonialsRef = useScrollReveal();
  const ctaRef = useScrollReveal();

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${primaryColor} transparent transparent transparent` }}
          />
          <p className="text-gray-500 text-sm">Loading school page…</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <h1 className="text-3xl font-bold text-gray-800">School not found</h1>
        <p className="text-gray-500">The school you're looking for doesn't exist or has been removed.</p>
        <Link href="/">
          <Button>Back to Home</Button>
        </Link>
      </div>
    );
  }

  const socialIconMap: Record<string, React.ComponentType<{ size?: number }>> = {
    facebook: Facebook,
    instagram: Instagram,
    linkedin: Linkedin,
    youtube: Youtube,
    twitter: Twitter,
    website: Globe,
  };

  return (
    <div
      style={
        {
          "--school-primary": primaryColor,
          "--school-secondary": secondaryColor,
          "--school-accent": accentColor,
          "--school-heading-color": headingColor,
          fontFamily: bodyFont,
        } as React.CSSProperties
      }
    >
      {/* Injected styles */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes kenBurns {
          from { transform: scale(1.05); }
          to   { transform: scale(1); }
        }
        .reveal-el {
          opacity: 0;
          transform: translateY(24px);
        }
        .animate-in .reveal-el {
          animation: fadeInUp 0.6s ease forwards;
        }
        .animate-in .reveal-el:nth-child(2) { animation-delay: 0.1s; }
        .animate-in .reveal-el:nth-child(3) { animation-delay: 0.2s; }
        .animate-in .reveal-el:nth-child(4) { animation-delay: 0.3s; }
        .animate-in .reveal-el:nth-child(5) { animation-delay: 0.4s; }
        .animate-in .reveal-el:nth-child(6) { animation-delay: 0.5s; }
      `}</style>

      {/* Custom school CSS */}
      {customCss && <style>{customCss}</style>}

      {/* 1. Announcement Bar */}
      {showAnnouncement && announcementText && (
        <div
          className="text-white text-center py-2 px-4 text-sm font-medium"
          style={{ background: announcementBgColor }}
        >
          {announcementText}
        </div>
      )}

      {/* 2. Navbar */}
      <nav
        className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={school.name} className="h-9 w-auto object-contain" />
            ) : (
              <span
                className="text-xl font-bold"
                style={{ fontFamily: headingFont, color: primaryColor }}
              >
                {school.name}
              </span>
            )}
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
              Home
            </a>
            <a href="#courses" className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
              Courses
            </a>
            <a href="#apply" className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors">
              Apply
            </a>
            {user ? (
              <Link
                href={dashboardPathFor((user as any)?.role)}
                className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
              >
                Sign In
              </Link>
            )}
            <button
              onClick={handleApply}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              style={{ background: primaryColor }}
            >
              Apply Now
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span
              className={`block w-6 h-0.5 bg-gray-700 transition-transform ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-gray-700 transition-opacity ${mobileMenuOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-gray-700 transition-transform ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            />
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 flex flex-col gap-4">
            <a href="#" className="text-gray-700 font-medium" onClick={() => setMobileMenuOpen(false)}>
              Home
            </a>
            <a href="#courses" className="text-gray-700 font-medium" onClick={() => setMobileMenuOpen(false)}>
              Courses
            </a>
            <a href="#apply" className="text-gray-700 font-medium" onClick={() => setMobileMenuOpen(false)}>
              Apply
            </a>
            {user ? (
              <Link
                href={dashboardPathFor((user as any)?.role)}
                className="text-gray-700 font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="text-gray-700 font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleApply();
              }}
              className="px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity w-fit"
              style={{ background: primaryColor }}
            >
              Apply Now
            </button>
          </div>
        )}
      </nav>

      {/* 3. Hero */}
      {bannerSlides.length > 0 ? (
        <HeroCarousel
          slides={bannerSlides}
          animation={heroAnimation}
          intervalSeconds={heroIntervalSeconds}
          headingFont={headingFont}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          onApply={handleApply}
        />
      ) : (
        <div
          className="w-full py-28 px-6 flex flex-col items-center justify-center text-white text-center"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          }}
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt={school.name}
              className="h-20 w-auto mb-6 object-contain drop-shadow-xl"
            />
          )}
          <h1
            className="text-5xl md:text-7xl font-bold mb-4 drop-shadow-xl"
            style={{ fontFamily: headingFont, textShadow: "0 2px 16px rgba(0,0,0,0.35)" }}
          >
            {school.name}
          </h1>
          {tagline && (
            <p className="text-xl md:text-2xl text-white/80 mb-8 max-w-2xl">{tagline}</p>
          )}
          <button
            onClick={handleApply}
            className="px-8 py-3 rounded-lg font-semibold text-lg shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: accentColor, color: "#fff" }}
          >
            Apply Now
          </button>
        </div>
      )}

      {/* 4. Stats Row */}
      {statsVisible && stats.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div ref={statsRef} className="max-w-6xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <StatCard key={i} stat={stat} primaryColor={primaryColor} />
            ))}
          </div>
        </section>
      )}

      {/* 5. Courses Section */}
      <section id="courses" className="py-16 bg-white">
        <div ref={coursesRef} className="max-w-7xl mx-auto px-4">
          <h2
            className="text-3xl font-bold mb-10 text-center reveal-el"
            style={{ fontFamily: headingFont, color: headingColor ?? primaryColor }}
          >
            Available Courses
          </h2>

          {courses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course, i) => (
                <div
                  key={course.id}
                  className={`reveal-el border border-gray-200 ${borderRadiusClass} overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col`}
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <div className="p-5 flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {course.code && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded border border-gray-200 text-gray-500">
                          {course.code}
                        </span>
                      )}
                      <div className="flex gap-1 ml-auto">
                        {course.is_live && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-500 text-white">
                            LIVE
                          </span>
                        )}
                        {course.term && (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {course.term}
                          </span>
                        )}
                      </div>
                    </div>
                    <h3
                      className="text-lg font-bold leading-snug"
                      style={{ fontFamily: headingFont, color: headingColor ?? primaryColor }}
                    >
                      {course.title}
                    </h3>
                    {course.teacherName && (
                      <p className="text-sm text-gray-500">Instructor: {course.teacherName}</p>
                    )}
                    {course.description && (
                      <p className="text-sm text-gray-600 line-clamp-3 mt-1 flex-1">{course.description}</p>
                    )}
                    {course.is_live && course.class_date && (
                      <p className="text-sm font-medium mt-2" style={{ color: primaryColor }}>
                        Next class:{" "}
                        {new Date(course.class_date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        at{" "}
                        {new Date(course.class_date).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>
                    )}
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      onClick={handleApply}
                      className={`w-full py-2 text-sm font-semibold text-white ${borderRadiusClass} hover:opacity-90 transition-opacity`}
                      style={{ background: primaryColor }}
                    >
                      Enroll
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-gray-100 reveal-el">
              <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 text-lg">No courses available yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* 6. Features Section */}
      {features.length > 0 && (
        <section className="py-16 bg-gray-50">
          <div ref={featuresRef} className="max-w-6xl mx-auto px-4">
            <h2
              className="text-3xl font-bold mb-10 text-center reveal-el"
              style={{ fontFamily: headingFont, color: headingColor ?? primaryColor }}
            >
              Why Choose Us
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature, i) => {
                const IconMap: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
                  users: Users,
                  award: Award,
                  star: Star,
                  book: BookOpen,
                  clock: Clock,
                  globe: Globe,
                };
                const IconComp = feature.icon ? (IconMap[feature.icon.toLowerCase()] ?? Star) : Star;
                return (
                  <div
                    key={i}
                    className={`reveal-el bg-white p-6 ${borderRadiusClass} shadow-sm border border-gray-100 hover:shadow-md transition-shadow`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                      style={{ background: `${primaryColor}18` }}
                    >
                      <IconComp size={24} color={primaryColor} />
                    </div>
                    <h3
                      className="text-lg font-bold mb-2"
                      style={{ fontFamily: headingFont, color: headingColor ?? primaryColor }}
                    >
                      {feature.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 7. Testimonials */}
      {testimonials.length > 0 && (
        <section className="py-16 bg-white">
          <div ref={testimonialsRef} className="max-w-6xl mx-auto px-4">
            <h2
              className="text-3xl font-bold mb-10 text-center reveal-el"
              style={{ fontFamily: headingFont, color: headingColor ?? primaryColor }}
            >
              What Our Students Say
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => {
                const initials = t.name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={i}
                    className={`reveal-el p-6 ${borderRadiusClass} border border-gray-100 shadow-sm`}
                    style={{
                      background: `${primaryColor}0d`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  >
                    <div
                      className="text-5xl font-serif leading-none mb-3"
                      style={{ color: primaryColor, opacity: 0.4 }}
                    >
                      &ldquo;
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed mb-5">{t.quote}</p>
                    <div className="flex items-center gap-3">
                      {t.avatar_url ? (
                        <img
                          src={t.avatar_url}
                          alt={t.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ background: primaryColor }}
                        >
                          {initials}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                        {t.role && <p className="text-xs text-gray-500">{t.role}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 8. Apply CTA Section */}
      <section id="apply" className="py-24">
        <div
          ref={ctaRef}
          className="max-w-4xl mx-auto px-4 text-center reveal-el"
        >
          <div
            className="rounded-2xl py-16 px-8"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
          >
            <h2
              className="text-3xl md:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: headingFont }}
            >
              Ready to join {school.name}?
            </h2>
            <p className="text-white/80 text-lg mb-8">
              Take the first step toward your future today.
            </p>
            <button
              onClick={handleApply}
              className="px-10 py-4 rounded-xl text-lg font-bold shadow-xl hover:scale-105 transition-transform"
              style={{ background: accentColor, color: "#fff" }}
            >
              Apply Now
            </button>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={school.name} className="h-10 w-auto object-contain brightness-0 invert opacity-80" />
            ) : (
              <span className="text-xl font-bold text-white" style={{ fontFamily: headingFont }}>
                {school.name}
              </span>
            )}
            {tagline && (
              <p className="text-gray-400 text-sm text-center max-w-sm">{tagline}</p>
            )}
          </div>

          {/* Social links */}
          {Object.keys(socialLinks).length > 0 && (
            <div className="flex gap-4">
              {(Object.entries(socialLinks) as [string, string][]).map(([platform, url]) => {
                if (!url) return null;
                const IconComp = socialIconMap[platform];
                if (!IconComp) return null;
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label={platform}
                  >
                    <IconComp size={20} />
                  </a>
                );
              })}
            </div>
          )}

          <p className="text-gray-600 text-xs">
            Powered by{" "}
            <a
              href="/"
              className="hover:text-gray-400 transition-colors underline underline-offset-2"
            >
              SolomonQuest
            </a>
          </p>
        </div>
      </footer>

      {/* Auth Gate Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: headingFont }}>
              Join {school.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-gray-600 text-sm">
            Create a free account to apply and access courses.
          </p>
          <div className="flex gap-3 mt-4">
            <Link href="/auth/login" onClick={() => setShowAuthDialog(false)} className="flex-1">
              <Button variant="outline" className="w-full">
                Log In
              </Button>
            </Link>
            <Link href="/auth/register" onClick={() => setShowAuthDialog(false)} className="flex-1">
              <Button
                className="w-full text-white"
                style={{ background: primaryColor }}
              >
                Sign Up
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
