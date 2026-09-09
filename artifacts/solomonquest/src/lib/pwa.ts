import { toast } from "sonner";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Registers the service worker and wires up the "new version available" toast. */
export function registerServiceWorker() {
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

        // Catches deploys that land while this tab sits open for a long
        // time without a full navigation happening on its own.
        const checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
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
