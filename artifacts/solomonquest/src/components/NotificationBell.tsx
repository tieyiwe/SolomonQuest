import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Bell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  created_at: string;
  read: boolean;
  link?: string | null;
}

interface MessageItem {
  id: string;
  sender_name: string;
  sender_avatar?: string;
  subject: string;
  created_at: string;
  read: boolean;
}

type TabType = "notifications" | "messages";

async function apiFetch(path: string, options?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

function dotColorByType(type: string): string {
  switch (type) {
    case "success":
      return "bg-green-500";
    case "error":
    case "alert":
      return "bg-red-500";
    case "warning":
      return "bg-yellow-500";
    case "info":
      return "bg-blue-500";
    case "message":
      return "bg-purple-500";
    default:
      return "bg-gray-400";
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("notifications");
  const [notifCount, setNotifCount] = useState(0);
  const [msgCount, setMsgCount] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const totalCount = notifCount + msgCount;

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setNotifCount(data.notifications ?? 0);
      setMsgCount(data.messages ?? 0);
    } catch {
      // silently fail
    }
  }, [user]);

  const triggerFlash = useCallback(() => {
    setFlashing(true);
    setTimeout(() => setFlashing(false), 1000);
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Supabase realtime: notifications
  useEffect(() => {
    if (!user) return;

    const notifChannel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifCount((c) => c + 1);
          triggerFlash();
          const row = payload.new as { title?: string; body?: string; message?: string };
          toast(row.title || row.message || "New notification", {
            description: row.title ? row.body : undefined,
          });
        }
      )
      .subscribe();

    const msgChannel = supabase
      .channel("messages-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages",
          filter: `to_user_id=eq.${user.id}`,
        },
        (payload) => {
          setMsgCount((c) => c + 1);
          triggerFlash();
          const row = payload.new as { subject?: string };
          toast(`New message: ${row.subject ?? ""}`.trim());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [user, triggerFlash]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const res = await apiFetch("/api/notifications?limit=20");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setNotifications(data.notifications ?? data ?? []);
    } catch {
      toast.error("Failed to load notifications");
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoadingMsgs(true);
    try {
      const res = await apiFetch("/api/messages/inbox?folder=unread");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const raw: any[] = data.messages ?? data ?? [];
      setMessages(
        raw.map((m) => ({
          id: m.id,
          sender_name: m.from_user?.name ?? m.sender_name ?? "Unknown",
          sender_avatar: m.from_user?.avatar_url ?? m.sender_avatar ?? undefined,
          subject: m.subject ?? m.body_preview ?? "",
          created_at: m.created_at,
          read: m.is_read ?? m.read ?? false,
        }))
      );
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiFetch("/api/notifications/read-all", { method: "PUT" });
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      toast.error("Failed to mark as read");
    }
  }, []);

  const handleBellClick = useCallback(() => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      fetchNotifications();
      fetchMessages();
      if (notifCount > 0) {
        markAllRead();
      }
    } else {
      // On close: reset notification count, keep messages count
      setNotifCount(0);
    }
  }, [open, fetchNotifications, fetchMessages, notifCount, markAllRead]);

  const handleNotifClick = useCallback(
    (notif: NotificationItem) => {
      if (notif.link) {
        navigate(notif.link);
      }
      setOpen(false);
    },
    [navigate]
  );

  const handleMsgClick = useCallback(
    (msg: MessageItem) => {
      navigate(`/messages?id=${msg.id}`);
      setOpen(false);
    },
    [navigate]
  );

  const badgeLabel =
    totalCount > 99 ? "99+" : totalCount > 0 ? String(totalCount) : null;

  return (
    <div className="relative inline-block">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={handleBellClick}
        className={[
          "relative p-2 rounded-full transition-colors",
          "hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-400",
          flashing ? "animate-pulse" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={`Notifications${totalCount > 0 ? `, ${totalCount} unread` : ""}`}
      >
        <Bell
          className={[
            "w-6 h-6 transition-colors",
            totalCount > 0 ? "text-gray-700" : "text-gray-400",
          ].join(" ")}
        />
        {/* Orange badge */}
        {badgeLabel && (
          <span
            className={[
              "absolute top-0 right-0 min-w-[18px] h-[18px] px-[3px]",
              "flex items-center justify-center",
              "bg-orange-500 text-white text-[10px] font-bold rounded-full",
              "leading-none select-none pointer-events-none",
            ].join(" ")}
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={dropdownRef}
          className={[
            "absolute right-0 mt-2 w-96 max-w-screen bg-white rounded-xl shadow-2xl border border-gray-200 z-50",
            "flex flex-col overflow-hidden",
          ].join(" ")}
          style={{ maxHeight: "80vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-900 text-base">
              Notifications
            </span>
            <button
              onClick={markAllRead}
              className="text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors"
            >
              Mark all read
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab("notifications")}
              className={[
                "flex-1 py-2 text-sm font-medium transition-colors",
                activeTab === "notifications"
                  ? "border-b-2 border-orange-500 text-orange-600"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              Notifications
              {notifCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                  {notifCount > 99 ? "99+" : notifCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={[
                "flex-1 py-2 text-sm font-medium transition-colors",
                activeTab === "messages"
                  ? "border-b-2 border-orange-500 text-orange-600"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              Messages
              {msgCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                  {msgCount > 99 ? "99+" : msgCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="overflow-y-auto flex-1">
            {activeTab === "notifications" && (
              <>
                {loadingNotifs ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    No notifications
                  </div>
                ) : (
                  <ul>
                    {notifications.map((notif) => (
                      <li key={notif.id}>
                        <button
                          onClick={() => handleNotifClick(notif)}
                          className={[
                            "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors",
                            "hover:bg-orange-50 focus:outline-none focus:bg-orange-50",
                            !notif.read ? "bg-orange-50/60" : "bg-white",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0",
                              dotColorByType(notif.type),
                            ].join(" ")}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-snug">
                              {notif.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {timeAgo(notif.created_at)}
                            </p>
                          </div>
                          {!notif.read && (
                            <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-gray-100 px-4 py-2.5">
                  <Link
                    href="/notifications"
                    className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                    onClick={() => setOpen(false)}
                  >
                    View all notifications
                  </Link>
                </div>
              </>
            )}

            {activeTab === "messages" && (
              <>
                {loadingMsgs ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    Loading...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    No unread messages
                  </div>
                ) : (
                  <ul>
                    {messages.map((msg) => (
                      <li key={msg.id}>
                        <button
                          onClick={() => handleMsgClick(msg)}
                          className={[
                            "w-full text-left flex items-start gap-3 px-4 py-3 transition-colors",
                            "hover:bg-orange-50 focus:outline-none focus:bg-orange-50",
                            !msg.read ? "bg-orange-50/60" : "bg-white",
                          ].join(" ")}
                        >
                          {/* Sender avatar */}
                          {msg.sender_avatar ? (
                            <img
                              src={msg.sender_avatar}
                              alt={msg.sender_name}
                              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-orange-200 flex items-center justify-center flex-shrink-0 text-orange-700 font-semibold text-sm uppercase">
                              {msg.sender_name?.[0] ?? "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {msg.sender_name}
                            </p>
                            <p className="text-sm text-gray-600 truncate">
                              {msg.subject}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {timeAgo(msg.created_at)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-gray-100 px-4 py-2.5">
                  <Link
                    href="/messages"
                    className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                    onClick={() => setOpen(false)}
                  >
                    Open inbox
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5 bg-gray-50">
            <Link
              href="/settings/notifications"
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              Notification preferences
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
