import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

// Re-shown a dismissal expires after this long — long enough not to nag,
// short enough that someone who dismissed it in a hurry still gets asked
// again eventually.
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DISMISSED_UNTIL_KEY = "sq_install_dismissed_until";
const INSTALLED_KEY = "sq_pwa_installed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isRunningInstalled(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari's own flag for "launched from the home screen".
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

function isDismissedForNow(): boolean {
  try {
    if (localStorage.getItem(INSTALLED_KEY) === "1") return true;
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
    return !!until && Date.now() < Number(until);
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isRunningInstalled() || isDismissedForNow()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onAppInstalled = () => {
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        // best-effort
      }
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_COOLDOWN_MS));
    } catch {
      // best-effort
    }
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome !== "accepted") dismiss();
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="flex items-center gap-3 rounded-xl border bg-card shadow-lg p-3 pl-4">
        <Download className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">Install SolomonQuest</p>
          <p className="text-xs text-muted-foreground leading-tight">Quick access from your home screen.</p>
        </div>
        <Button size="sm" onClick={install}>
          Install
        </Button>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground shrink-0 p-1"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
