import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { createElement } from "react";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const JUST_UPDATED_KEY = "sq_pwa_just_updated";

/**
 * Registers the service worker and wires up the "new version available"
 * toast — works identically whether the app is running in a normal
 * browser tab, installed on desktop, or installed on mobile, since all of
 * those are just different windows around the same page/service worker.
 */
export function registerServiceWorker() {
  showUpdatedConfirmationIfPending();

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // A worker was already waiting when we registered (e.g. a deploy
        // landed while this tab was closed) — surface it immediately.
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdateReady(registration);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              notifyUpdateReady(registration);
            }
          });
        });

        // Catches deploys that land while this tab/installed window sits
        // open for a long time without a full navigation happening on its
        // own: re-checks whenever the tab regains focus, whenever the
        // device comes back online, and on a fallback interval.
        const checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        window.addEventListener("online", checkForUpdate);
        window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      })
      .catch(() => {
        // Non-fatal — the app still works without a service worker, just
        // without install prompts or offline asset caching.
      });
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    try {
      sessionStorage.setItem(JUST_UPDATED_KEY, "1");
    } catch {
      // best-effort — worst case the confirmation toast just doesn't show
    }
    window.location.reload();
  });
}

let updateToastShown = false;

function notifyUpdateReady(registration: ServiceWorkerRegistration) {
  if (updateToastShown) return;
  updateToastShown = true;

  toast("A new version of SolomonQuest is available", {
    duration: Infinity,
    action: {
      label: "Refresh",
      onClick: () => {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}

/** Shows a brief "Updated" confirmation right after the reload an update triggered. */
function showUpdatedConfirmationIfPending() {
  try {
    if (sessionStorage.getItem(JUST_UPDATED_KEY) !== "1") return;
    sessionStorage.removeItem(JUST_UPDATED_KEY);
  } catch {
    return;
  }

  toast.success("Updated", {
    icon: createElement(CheckCircle2, { className: "h-4 w-4" }),
    duration: 2500,
  });
}
