import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { getImpersonationTarget, returnToOrigin, type ImpersonationTarget } from "@/lib/impersonation";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Teacher",
  staff: "Staff",
  student: "Student",
};

export function ImpersonationBanner() {
  const [target, setTarget] = useState<ImpersonationTarget | null>(null);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    setTarget(getImpersonationTarget());
  }, []);

  if (!target) return null;

  return (
    <>
      {/* Several dashboard layouts (StudentLayout, TeacherLayout, ...) are
          `h-screen` with their own internal `sticky top-0` header, which can
          bury a merely-sticky banner mounted above them in the DOM — sticky
          elements stack in document order, so a later sticky header can end
          up covering an earlier one at the same scroll position. Pinning
          this to the viewport with `fixed` + a very high z-index guarantees
          it's always visible regardless of how any given layout scrolls. */}
      <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 text-amber-950 px-4 py-2 text-sm font-medium shadow-md">
        <Eye className="w-4 h-4 shrink-0" />
        <span>
          Viewing as <strong>{target.name}</strong> ({ROLE_LABELS[target.role] ?? target.role})
        </span>
        <button
          onClick={async () => {
            setReturning(true);
            try {
              await returnToOrigin();
            } finally {
              setReturning(false);
            }
          }}
          disabled={returning}
          className="ml-2 inline-flex items-center gap-1 bg-amber-950/10 hover:bg-amber-950/20 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <X className="w-3.5 h-3.5" />
          {returning ? "Returning…" : "Return to My Account"}
        </button>
      </div>
      {/* Reserves the space the fixed banner above now occupies so it
          doesn't overlap the very top of whatever layout renders next
          (e.g. covering a dashboard's own sticky header/logo). */}
      <div className="h-10" aria-hidden="true" />
    </>
  );
}
