import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Inbox, ArrowLeft, Search, Edit, Reply } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

async function apiFetch(url: string, options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...(options.headers ?? {}),
    },
  });
}

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  subject: string;
  body: string;
  created_at: string;
  read: boolean;
  from_name?: string;
  from_email?: string;
  to_name?: string;
  to_email?: string;
}

interface UserResult {
  id: string;
  name: string;
  internal_email: string;
}

type Folder = "inbox" | "sent" | "search";
type PanelState = "empty" | "detail" | "compose";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function AvatarCircle({ name, size = 36 }: { name: string; size?: number }) {
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const isMobile = useIsMobile();

  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [panelState, setPanelState] = useState<PanelState>("empty");
  const [searchQuery, setSearchQuery] = useState("");

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeToUser, setComposeToUser] = useState<UserResult | null>(null);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserResult[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyContext, setReplyContext] = useState<Message | null>(null);

  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Recent contacts (extracted from messages)
  const [recentContacts, setRecentContacts] = useState<UserResult[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetchMessages();
  }, [folder, userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_messages",
          filter: "to_user_id=eq." + userId,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (folder === "inbox") {
            setMessages((prev) => [newMsg, ...prev]);
          }
          const fromName = newMsg.from_name ?? "Someone";
          toast.info(`New message from ${fromName}`);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, folder]);

  async function fetchMessages() {
    setLoading(true);
    try {
      const endpoint =
        folder === "inbox"
          ? "/api/messages/inbox"
          : folder === "sent"
          ? "/api/messages/sent"
          : `/api/messages/search?query=${encodeURIComponent(searchQuery)}`;
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? data ?? []);
        // Build recent contacts
        const contacts: UserResult[] = [];
        const seen = new Set<string>();
        for (const m of data.messages ?? data ?? []) {
          const otherId =
            folder === "sent" ? m.to_user_id : m.from_user_id;
          if (!seen.has(otherId) && otherId !== userId) {
            seen.add(otherId);
            contacts.push({
              id: otherId,
              name:
                folder === "sent"
                  ? m.to_name ?? otherId
                  : m.from_name ?? otherId,
              internal_email:
                folder === "sent"
                  ? m.to_email ?? ""
                  : m.from_email ?? "",
            });
          }
        }
        setRecentContacts(contacts.slice(0, 5));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function searchMessages() {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/messages/search?query=${encodeURIComponent(searchQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function openCompose(reply?: Message) {
    setReplyContext(reply ?? null);
    if (reply) {
      setComposeToUser({
        id: reply.from_user_id,
        name: reply.from_name ?? reply.from_user_id,
        internal_email: reply.from_email ?? "",
      });
      setComposeTo(reply.from_name ?? reply.from_email ?? "");
      setComposeSubject(
        reply.subject.startsWith("Re:") ? reply.subject : "Re: " + reply.subject
      );
    } else {
      setComposeToUser(null);
      setComposeTo("");
      setComposeSubject("");
    }
    setComposeBody("");
    setPanelState("compose");
  }

  async function handleSend() {
    if (!composeToUser) {
      toast.error("Please select a recipient.");
      return;
    }
    if (!composeSubject.trim()) {
      toast.error("Subject is required.");
      return;
    }
    if (!composeBody.trim()) {
      toast.error("Message body is required.");
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch("/api/messages/send", {
        method: "POST",
        body: JSON.stringify({
          to_user_id: composeToUser.id,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      if (res.ok) {
        toast.success("Message sent!");
        setPanelState("empty");
        setReplyContext(null);
        if (folder === "sent") fetchMessages();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to send message.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleUserSearch(query: string) {
    setComposeTo(query);
    setComposeToUser(null);
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    if (!query.trim()) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      return;
    }
    userSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/users/search?query=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data = await res.json();
          setUserSearchResults(data.users ?? data ?? []);
          setShowUserDropdown(true);
        }
      } catch {
        // silently fail
      }
    }, 300);
  }

  function selectUser(u: UserResult) {
    setComposeToUser(u);
    setComposeTo(u.name + " <" + u.internal_email + ">");
    setUserSearchResults([]);
    setShowUserDropdown(false);
  }

  async function markRead(msg: Message) {
    if (!msg.read) {
      await apiFetch(`/api/messages/${msg.id}/read`, { method: "PATCH" });
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      );
    }
  }

  function openMessage(msg: Message) {
    setSelectedMessage(msg);
    setPanelState("detail");
    markRead(msg);
  }

  const unreadCount = messages.filter(
    (m) => !m.read && folder === "inbox"
  ).length;

  const displayMessages =
    folder === "inbox" || folder === "sent"
      ? messages
      : messages;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        height: "calc(100vh - 64px)",
        fontFamily: "inherit",
        background: "#f8fafc",
        overflow: isMobile ? "auto" : "hidden",
      }}
    >
      {/* LEFT SIDEBAR — hidden on mobile once a message/compose panel is open,
          so that panel gets the full screen instead of being squeezed into
          whatever space is left after two fixed-width desktop columns. */}
      {(!isMobile || panelState === "empty") && (
      <div
        style={{
          width: isMobile ? "100%" : 200,
          background: "#fff",
          borderRight: isMobile ? "none" : "1px solid #e2e8f0",
          borderBottom: isMobile ? "1px solid #e2e8f0" : "none",
          display: "flex",
          flexDirection: "column",
          padding: "16px 8px",
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Button
          onClick={() => openCompose()}
          style={{
            width: "100%",
            marginBottom: 12,
            background: "#6366f1",
            color: "#fff",
            fontWeight: 600,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "center",
          }}
        >
          <Edit size={16} />
          Compose
        </Button>

        {/* Folder: Inbox */}
        <button
          onClick={() => {
            setFolder("inbox");
            setPanelState("empty");
            setSelectedMessage(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: folder === "inbox" ? "#eef2ff" : "transparent",
            color: folder === "inbox" ? "#6366f1" : "#374151",
            fontWeight: folder === "inbox" ? 700 : 400,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            fontSize: 14,
          }}
        >
          <Inbox size={16} />
          <span style={{ flex: 1 }}>Inbox</span>
          {unreadCount > 0 && (
            <span
              style={{
                background: "#f97316",
                color: "#fff",
                borderRadius: "50%",
                width: 20,
                height: 20,
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* Folder: Sent */}
        <button
          onClick={() => {
            setFolder("sent");
            setPanelState("empty");
            setSelectedMessage(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: folder === "sent" ? "#eef2ff" : "transparent",
            color: folder === "sent" ? "#6366f1" : "#374151",
            fontWeight: folder === "sent" ? 700 : 400,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            fontSize: 14,
          }}
        >
          <Send size={16} />
          Sent
        </button>

        {/* Folder: Search */}
        <button
          onClick={() => {
            setFolder("search");
            setPanelState("empty");
            setSelectedMessage(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: folder === "search" ? "#eef2ff" : "transparent",
            color: folder === "search" ? "#6366f1" : "#374151",
            fontWeight: folder === "search" ? 700 : 400,
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            fontSize: 14,
          }}
        >
          <Search size={16} />
          Search
        </button>

        {/* Recent contacts */}
        {recentContacts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p
              style={{
                fontSize: 11,
                color: "#9ca3af",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "0 12px",
                marginBottom: 6,
              }}
            >
              Recent
            </p>
            {recentContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  selectUser(c);
                  openCompose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  fontSize: 13,
                  color: "#374151",
                }}
              >
                <AvatarCircle name={c.name} size={24} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* CENTER MESSAGE LIST — same mobile rule as the sidebar above. */}
      {(!isMobile || panelState === "empty") && (
      <div
        style={{
          width: isMobile ? "100%" : 360,
          background: "#fff",
          borderRight: isMobile ? "none" : "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Search bar for search folder */}
        {folder === "search" && (
          <div
            style={{
              padding: "12px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              gap: 8,
            }}
          >
            <Input
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchMessages()}
              style={{ flex: 1 }}
            />
            <Button onClick={searchMessages} size="sm">
              <Search size={14} />
            </Button>
          </div>
        )}

        {/* List header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #f1f5f9",
            fontWeight: 600,
            fontSize: 15,
            color: "#1e293b",
          }}
        >
          {folder === "inbox"
            ? "Inbox"
            : folder === "sent"
            ? "Sent"
            : "Search Results"}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 120,
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              Loading...
            </div>
          ) : displayMessages.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 200,
                color: "#9ca3af",
                gap: 8,
              }}
            >
              <Inbox size={40} strokeWidth={1} />
              <p style={{ fontSize: 14 }}>No messages yet</p>
            </div>
          ) : (
            displayMessages.map((msg) => {
              const isUnread = !msg.read && folder === "inbox";
              const isSelected = selectedMessage?.id === msg.id;
              const displayName =
                folder === "sent"
                  ? msg.to_name ?? msg.to_user_id
                  : msg.from_name ?? msg.from_user_id;
              return (
                <button
                  key={msg.id}
                  onClick={() => openMessage(msg)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 16px",
                    background: isSelected
                      ? "#eef2ff"
                      : isUnread
                      ? "#fafafa"
                      : "#fff",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.background =
                        "#f8fafc";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLElement).style.background =
                        isUnread ? "#fafafa" : "#fff";
                  }}
                >
                  <AvatarCircle name={displayName} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: isUnread ? 700 : 500,
                          fontSize: 14,
                          color: "#1e293b",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 160,
                        }}
                      >
                        {displayName}
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isUnread ? 600 : 400,
                        color: "#374151",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 2,
                      }}
                    >
                      {msg.subject}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {msg.body}
                    </div>
                  </div>
                  {isUnread && (
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#f97316",
                        flexShrink: 0,
                        marginTop: 6,
                      }}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* RIGHT PANEL — on mobile only rendered once a message is open or
          compose is active, so it gets the full screen; the "select a
          message" placeholder below is desktop-only (the mobile empty
          state is just the list itself, above). */}
      {(!isMobile || panelState !== "empty") && (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", width: isMobile ? "100%" : undefined }}>
        {panelState === "empty" && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              gap: 12,
            }}
          >
            <Inbox size={56} strokeWidth={1} />
            <p style={{ fontSize: 16, fontWeight: 500 }}>
              Select a message to read
            </p>
            <p style={{ fontSize: 13 }}>
              Or{" "}
              <button
                onClick={() => openCompose()}
                style={{
                  color: "#6366f1",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  padding: 0,
                }}
              >
                compose a new message
              </button>
            </p>
          </div>
        )}

        {panelState === "detail" && selectedMessage && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "32px 40px",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#1e293b",
                  lineHeight: 1.3,
                  flex: 1,
                  marginRight: 16,
                }}
              >
                {selectedMessage.subject}
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openCompose(selectedMessage)}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Reply size={14} />
                  Reply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPanelState("empty");
                    setSelectedMessage(null);
                  }}
                >
                  <ArrowLeft size={14} />
                </Button>
              </div>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                padding: "16px 20px",
                marginBottom: 24,
                fontSize: 14,
                color: "#374151",
                lineHeight: 1.7,
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", width: 40 }}>From:</span>
                <span style={{ fontWeight: 500 }}>
                  {selectedMessage.from_name ?? selectedMessage.from_user_id}
                  {selectedMessage.from_email
                    ? ` <${selectedMessage.from_email}>`
                    : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", width: 40 }}>To:</span>
                <span style={{ fontWeight: 500 }}>
                  {selectedMessage.to_name ?? selectedMessage.to_user_id}
                  {selectedMessage.to_email
                    ? ` <${selectedMessage.to_email}>`
                    : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "#9ca3af", width: 40 }}>Date:</span>
                <span>
                  {new Date(selectedMessage.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            <div
              style={{
                fontSize: 15,
                color: "#1e293b",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
              }}
            >
              {selectedMessage.body}
            </div>
          </div>
        )}

        {panelState === "compose" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "32px 40px",
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              }}
            >
              <h2
                style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}
              >
                {replyContext ? "Reply" : "New Message"}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPanelState(selectedMessage ? "detail" : "empty");
                  setReplyContext(null);
                }}
              >
                <ArrowLeft size={14} />
                Cancel
              </Button>
            </div>

            {replyContext && (
              <div
                style={{
                  background: "#f8fafc",
                  borderLeft: "3px solid #6366f1",
                  padding: "10px 16px",
                  marginBottom: 20,
                  borderRadius: "0 6px 6px 0",
                  fontSize: 13,
                  color: "#6b7280",
                }}
              >
                <p style={{ fontWeight: 600, color: "#374151", marginBottom: 2 }}>
                  Replying to: {replyContext.subject}
                </p>
                <p>
                  From:{" "}
                  {replyContext.from_name ?? replyContext.from_user_id}
                </p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* To field */}
              <div style={{ position: "relative" }} ref={dropdownRef}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  To
                </label>
                <Input
                  placeholder="Search by name or email..."
                  value={composeTo}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  onFocus={() => {
                    if (userSearchResults.length > 0)
                      setShowUserDropdown(true);
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowUserDropdown(false), 150)
                  }
                />
                {showUserDropdown && userSearchResults.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                      zIndex: 100,
                      marginTop: 4,
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {userSearchResults.map((u) => (
                      <button
                        key={u.id}
                        onMouseDown={() => selectUser(u)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          background: "transparent",
                          border: "none",
                          width: "100%",
                          textAlign: "left",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "#1e293b",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "#f8fafc";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            "transparent";
                        }}
                      >
                        <AvatarCircle name={u.name} size={28} />
                        <div>
                          <div style={{ fontWeight: 500 }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            {u.internal_email}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {composeToUser && (
                  <div
                    style={{
                      marginTop: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#eef2ff",
                      borderRadius: 20,
                      padding: "4px 10px",
                      fontSize: 13,
                      color: "#6366f1",
                      fontWeight: 500,
                    }}
                  >
                    <AvatarCircle name={composeToUser.name} size={20} />
                    {composeToUser.name}
                    <button
                      onClick={() => {
                        setComposeToUser(null);
                        setComposeTo("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#6366f1",
                        padding: 0,
                        lineHeight: 1,
                        fontSize: 16,
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Subject
                </label>
                <Input
                  placeholder="Subject"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>

              {/* Body */}
              <div>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#374151",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Message
                </label>
                <Textarea
                  placeholder="Write your message..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  style={{ minHeight: 200, resize: "vertical" }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10 }}>
                <Button
                  onClick={handleSend}
                  disabled={sending}
                  style={{
                    background: "#6366f1",
                    color: "#fff",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Send size={15} />
                  {sending ? "Sending..." : "Send"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPanelState(selectedMessage ? "detail" : "empty");
                    setReplyContext(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
