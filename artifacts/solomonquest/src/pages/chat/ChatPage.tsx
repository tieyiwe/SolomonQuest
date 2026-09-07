import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { NotificationBell } from "@/components/NotificationBell";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Send,
  Hash,
  Lock,
  User,
  Phone,
  Search,
  Plus,
  X,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Users,
  BookOpen,
  Settings,
  CheckSquare,
  FolderOpen,
  BarChart2,
  Bell,
  AlertTriangle,
  HelpCircle,
  FileText,
  ClipboardList,
  CalendarCheck,
  AlarmClock,
  Scroll,
  GraduationCap,
  MoreVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowLeft,
  Paperclip,
  Download,
  Loader2,
  Smile,
  SmilePlus,
  Mail,
  Check,
  CheckCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Channel {
  id: string;
  name: string;
  type: "public" | "course" | "private" | "direct";
  description?: string;
  unread_count?: number;
  member_count?: number;
  active_call?: { jitsi_room: string } | null;
  createdAt?: string | null;
  isArchived?: boolean;
  otherUser?: { id: string; name: string; role: string | null; onlineAt: string | null; lastReadAt: string | null } | null;
}

interface IncomingCall {
  id: string;
  jitsiRoom: string;
  channelId: string;
  channelName: string;
}

interface ActiveCall {
  id: string;
  jitsiRoom: string;
  channelId: string;
  channelName: string;
}

interface ChatMessage {
  id: string;
  channel_id: string;
  content: string;
  thread_parent_id?: string | null;
  thread_count?: number;
  created_at: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  reactions?: { emoji: string; count: number; userIds: string[] }[];
  isEdited?: boolean;
  editedAt?: string | null;
  sender: {
    id: string;
    name: string;
    avatar_url?: string | null;
    online_at?: string | null;
  };
  _optimistic?: boolean;
  _uploading?: boolean;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EDIT_WINDOW_MS = 3 * 60 * 1000;

function formatLastSeen(onlineAt?: string | null): string {
  if (!onlineAt) return "Offline";
  const diffMs = Date.now() - new Date(onlineAt).getTime();
  if (diffMs < 2 * 60 * 1000) return "Online";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Active ${days}d ago`;
  return `Last seen ${new Date(onlineAt).toLocaleDateString()}`;
}

interface UserResult {
  id: string;
  name: string;
  unique_student_id: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const token = await getToken();
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

const AVATAR_COLORS = [
  "#ef4444","#f97316","#f59e0b","#84cc16","#22c55e",
  "#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899",
];

function nameColor(name: string): string {
  const safe = name || "?";
  let h = 0;
  for (let i = 0; i < safe.length; i++) h = safe.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Colors assigned by speaking order within a single conversation, so any two
// people talking are guaranteed visually distinct rather than left to a name
// hash that could collide. First two speakers are brown and green; anyone
// past that gets the next color down the list.
const CONVERSATION_COLORS = [
  "#92400e", // brown
  "#16a34a", // green
  "#2563eb", // blue
  "#db2777", // pink
  "#7c3aed", // purple
  "#0891b2", // cyan
  "#ea580c", // orange
  "#4f46e5", // indigo
];

interface ParticipantColorRegistry {
  getColor(userId?: string | null, name?: string): string;
}

const noopRegistry: ParticipantColorRegistry = {
  getColor: (_userId, name) => nameColor(name ?? "?"),
};

const ParticipantColorContext = createContext<ParticipantColorRegistry>(noopRegistry);

/**
 * Assigns each distinct speaker in a conversation a color the first time
 * they're seen — by any Avatar anywhere (main message list, inline thread
 * preview, or the full thread panel), not just top-level channel messages.
 * That's what keeps someone's color consistent between the main feed and a
 * thread reply even if the reply loads before their first channel message
 * does.
 */
function useParticipantColorRegistry(resetKey: string | null): ParticipantColorRegistry {
  // Recreated whenever the active conversation changes, so a new chat always
  // restarts its color assignment at brown/green rather than carrying over
  // colors from whichever conversation was open before.
  const assignments = useMemo(() => new Map<string, string>(), [resetKey]);
  return useMemo(
    () => ({
      getColor(userId?: string | null, name?: string) {
        if (!userId) return nameColor(name ?? "?");
        const existing = assignments.get(userId);
        if (existing) return existing;
        const color = CONVERSATION_COLORS[assignments.size % CONVERSATION_COLORS.length];
        assignments.set(userId, color);
        return color;
      },
    }),
    [assignments]
  );
}

function useParticipantColor(userId?: string | null, name?: string): string {
  const registry = useContext(ParticipantColorContext);
  return registry.getColor(userId, name);
}

function initials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * The REST chat API returns camelCase fields (createdAt, threadParentId,
 * channelId, replyCount, isEdited, editedAt), but every ChatMessage
 * consumer in this file reads the snake_case shape realtime INSERT
 * payloads use instead (created_at, thread_parent_id, channel_id,
 * thread_count) — straight from Postgres, so already snake_case. Any
 * message coming from a REST response (initial fetch, send, thread
 * fetch/reply) needs to go through this first, or created_at reads as
 * undefined and every timestamp renders as "Invalid Date".
 */
function normalizeMessage(raw: any): ChatMessage {
  return {
    ...raw,
    channel_id: raw.channel_id ?? raw.channelId,
    thread_parent_id: raw.thread_parent_id ?? raw.threadParentId ?? null,
    thread_count: raw.thread_count ?? raw.replyCount ?? 0,
    created_at: raw.created_at ?? raw.createdAt,
    attachmentUrl: raw.attachmentUrl ?? raw.attachment_url ?? null,
    attachmentName: raw.attachmentName ?? raw.attachment_name ?? null,
    attachmentType: raw.attachmentType ?? raw.attachment_type ?? null,
    attachmentSize: raw.attachmentSize ?? raw.attachment_size ?? null,
    isEdited: raw.isEdited ?? raw.is_edited ?? false,
    editedAt: raw.editedAt ?? raw.edited_at ?? null,
  };
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

function isOnline(onlineAt?: string | null): boolean {
  if (!onlineAt) return false;
  return Date.now() - new Date(onlineAt).getTime() < 2 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({
  name,
  userId,
  size = "md",
}: {
  name: string;
  userId?: string | null;
  size?: "2xs" | "xs" | "sm" | "md";
}) {
  const color = useParticipantColor(userId, name);
  const sz =
    size === "2xs"
      ? "w-5 h-5 text-[8px]"
      : size === "xs"
      ? "w-6 h-6 text-[10px]"
      : size === "sm"
      ? "w-7 h-7 text-xs"
      : "w-9 h-9 text-sm";
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initials(name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel icon
// ---------------------------------------------------------------------------

function ChannelIcon({ type, className = "w-3.5 h-3.5" }: { type: Channel["type"]; className?: string }) {
  if (type === "private") return <Lock className={className} />;
  if (type === "direct") return <User className={className} />;
  return <Hash className={className} />;
}

// ---------------------------------------------------------------------------
// Sidebar channel button
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  teacher: "Teacher",
  staff: "Staff",
  student: "Student",
};

function roleLabel(role?: string | null): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? null;
}

function SidebarChannel({
  ch,
  active,
  onClick,
  onArchive,
  onDelete,
}: {
  ch: Channel;
  active: boolean;
  onClick: () => void;
  onArchive?: (ch: Channel, archived: boolean) => void;
  onDelete?: (ch: Channel) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasUnread = (ch.unread_count ?? 0) > 0;
  const role = ch.type === "direct" ? roleLabel(ch.otherUser?.role) : null;

  return (
    <div
      className={`group relative w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
        active
          ? "bg-white/10 text-white"
          : hasUnread
          ? "text-white bg-white/[0.03]"
          : "text-[#b9bbbe] hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-orange-400 to-pink-500" />
      )}
      <button onClick={onClick} className="flex-1 flex items-center gap-2 min-w-0 text-left">
        {hasUnread ? (
          <Mail className="w-3.5 h-3.5 flex-shrink-0 text-orange-400" />
        ) : (
          <ChannelIcon type={ch.type} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
        )}
        <span className="flex-1 min-w-0 text-left">
          <span className={`block truncate ${hasUnread ? "font-bold" : ""}`}>{ch.name}</span>
          {role && (
            <span className="block truncate text-[10px] font-normal uppercase tracking-wide text-[#8a8d93]">
              {role}
            </span>
          )}
        </span>
      </button>
      {hasUnread && (
        <span className="text-xs font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight shrink-0">
          {ch.unread_count}
        </span>
      )}
      {(onArchive || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 transition-opacity"
              title="Channel options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(ch, !ch.isArchived)}>
                {ch.isArchived ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5 mr-2" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 mr-2" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onDelete && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{ch.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the conversation and all its messages for everyone in it.
                This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDelete(ch)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// People Search — visible search bar at the top of the chat sidebar
// ---------------------------------------------------------------------------

interface PersonResult {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  internal_email?: string | null;
  role?: string | null;
  avatar_url?: string | null;
  unique_student_id?: string | null;
}

function PeopleSearch({
  onOpenDm,
  directChannels,
}: {
  onOpenDm: (userId: string, name: string) => void;
  directChannels: Channel[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(q: string) {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    // Empty query still hits the API — it returns the whole school directory,
    // alphabetically, so people can browse before typing anything.
    timerRef.current = setTimeout(() => runSearch(query.trim()), query.trim() ? 300 : 0);
  }, [query, open]);

  function fullName(p: PersonResult) {
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || p.internal_email || "Unknown";
  }

  return (
    <div className="px-2 pb-2 relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#72767d]" />
        <input
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-white/8 border border-white/10 text-white placeholder:text-[#72767d] focus:outline-none focus:ring-1 focus:ring-white/20"
          placeholder="Find people..."
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="absolute right-2 top-2 text-[#72767d] hover:text-white"
            onClick={() => { setQuery(""); setResults([]); }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (results.length > 0 || loading) && (
        <div className="absolute left-2 right-2 mt-1 rounded-md border border-white/10 overflow-hidden z-50" style={{ backgroundColor: "#2b2d42" }}>
          {loading && (
            <p className="px-3 py-2 text-xs text-[#72767d]">Searching…</p>
          )}
          {results.map((p) => {
            const name = fullName(p);
            const existing = directChannels.find((c) => c.name === name);
            const chatDate = existing?.createdAt
              ? new Date(existing.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
              : null;
            return (
              <button
                key={p.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/10 transition-colors text-left"
                onClick={() => {
                  onOpenDm(p.id, name);
                  setQuery("");
                  setResults([]);
                }}
              >
                <Avatar name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{name}</p>
                  {chatDate ? (
                    <p className="text-[#72767d] text-xs truncate">Chatted since {chatDate}</p>
                  ) : p.internal_email ? (
                    <p className="text-[#72767d] text-xs truncate">{p.internal_email}</p>
                  ) : null}
                </div>
                {p.role && (
                  <span className="text-[10px] text-[#72767d] capitalize shrink-0">
                    {p.role.replace("_", " ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Channel Dialog
// ---------------------------------------------------------------------------

function NewChannelDialog({
  onCreated,
  onOpenDm,
}: {
  onCreated: (ch: Channel) => void;
  onOpenDm: (userId: string, name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"private" | "direct">("private");
  const [channelName, setChannelName] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/users/search?query=${encodeURIComponent(q)}`);
        if (res.ok) {
          const raw: PersonResult[] = await res.json();
          setUserResults(
            raw.map((p) => ({
              id: p.id,
              name:
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                p.internal_email ||
                "Unknown",
              unique_student_id: p.unique_student_id ?? "",
            }))
          );
        }
      } catch {
        /* ignore */
      }
    }, 300);
  }, []);

  useEffect(() => {
    searchUsers(userQuery);
  }, [userQuery, searchUsers]);

  function toggleUser(u: UserResult) {
    if (mode === "direct") {
      // A direct message is always exactly one other person — picking someone
      // new replaces the previous pick instead of building a group.
      setSelectedUsers((prev) => (prev[0]?.id === u.id ? [] : [u]));
      return;
    }
    setSelectedUsers((prev) =>
      prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  }

  async function handleCreate() {
    if (selectedUsers.length === 0) {
      toast.error("Select a user");
      return;
    }

    if (mode === "direct") {
      // DMs don't need a channel name/dialog round trip — reuse the same
      // dedup-aware logic the sidebar's quick "Find people" search uses.
      setLoading(true);
      const ok = await onOpenDm(selectedUsers[0].id, selectedUsers[0].name);
      setLoading(false);
      if (ok) {
        setOpen(false);
        setSelectedUsers([]);
        setUserQuery("");
      }
      return;
    }

    const name = channelName.trim();
    if (!name) {
      toast.error("Enter a channel name");
      return;
    }
    // A channel is a group conversation — you plus at least 2 others (3
    // total). Anything smaller is just a direct message, which has its own
    // frictionless flow above and doesn't need a name.
    if (selectedUsers.length < 2) {
      toast.error("A channel needs at least 3 people — pick 2 more, or use Direct Message for just one person");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: mode, memberIds: selectedUsers.map((u) => u.id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      onCreated(body as Channel);
      setOpen(false);
      setChannelName("");
      setSelectedUsers([]);
      setUserQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="w-5 h-5 rounded flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-white/10 transition-colors"
          title="Create channel"
        >
          <Plus className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "direct" ? "New Direct Message" : "New Channel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex gap-2">
            <Button
              variant={mode === "private" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("private")}
            >
              <Lock className="w-3.5 h-3.5 mr-1" /> Private Channel
            </Button>
            <Button
              variant={mode === "direct" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("direct")}
            >
              <User className="w-3.5 h-3.5 mr-1" /> Direct Message
            </Button>
          </div>

          {mode === "private" && (
            <Input
              placeholder="Channel name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search users..."
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full"
                >
                  {u.name}
                  <button onClick={() => toggleUser(u)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {userResults.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-y-auto">
              {userResults.map((u) => {
                const sel = !!selectedUsers.find((x) => x.id === u.id);
                return (
                  <button
                    key={u.id}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 ${
                      sel ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleUser(u)}
                  >
                    <Avatar name={u.name} size="sm" />
                    <span className="font-medium">{u.name}</span>
                    <span className="text-muted-foreground text-xs">{u.unique_student_id}</span>
                  </button>
                );
              })}
            </div>
          )}

          <Button className="w-full" onClick={handleCreate} disabled={loading}>
            {loading
              ? mode === "direct"
                ? "Opening..."
                : "Creating..."
              : mode === "direct"
              ? "Message"
              : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inline thread preview (collapsed)
// ---------------------------------------------------------------------------

function ThreadComposer({
  count,
  channelId,
  parentId,
  currentUserId,
  currentUserName,
}: {
  count: number;
  channelId: string;
  parentId: string;
  currentUserId: string;
  currentUserName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyCount, setReplyCount] = useState(count);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchReplies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/chat/channels/${channelId}/messages/${parentId}/thread`);
      if (res.ok) {
        const data = await res.json();
        setReplies((data as any[]).map(normalizeMessage));
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [channelId, parentId]);

  async function toggle() {
    if (!expanded) await fetchReplies();
    setExpanded((v) => !v);
  }

  // Live-update the reply list while expanded, so replies from other
  // members appear immediately without needing to collapse/reopen.
  useEffect(() => {
    if (!expanded) return;
    const sub = supabase
      .channel(`thread-inline:${channelId}:${parentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.thread_parent_id !== parentId) return;
          setReplies((prev) => (prev.find((r) => r.id === msg.id) ? prev : [...prev, msg]));
          setReplyCount((c) => c + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [expanded, channelId, parentId]);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length, expanded]);

  async function sendReply(content: string) {
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      channel_id: channelId,
      content,
      thread_parent_id: parentId,
      created_at: new Date().toISOString(),
      sender: { id: currentUserId, name: currentUserName },
      _optimistic: true,
    };
    setReplies((prev) => [...prev, optimistic]);
    setReplyCount((c) => c + 1);
    try {
      const res = await apiFetch(`/api/chat/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, threadParentId: parentId }),
      });
      if (!res.ok) throw new Error();
      const saved = normalizeMessage(await res.json());
      setReplies((prev) => prev.map((r) => (r.id === optimisticId ? saved : r)));
    } catch {
      setReplies((prev) => prev.filter((r) => r.id !== optimisticId));
      setReplyCount((c) => Math.max(0, c - 1));
      toast.error("Failed to send reply");
    }
  }

  return (
    <div className="mt-1">
      <button
        className={`flex items-center gap-1.5 text-xs font-medium transition-opacity ${
          replyCount > 0
            ? "text-blue-500 hover:text-blue-600"
            : "text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
        }`}
        onClick={toggle}
      >
        {replyCount > 0 ? (
          <>
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <MessageSquare className="w-3.5 h-3.5" />
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </>
        ) : (
          <>
            <MessageSquare className="w-3.5 h-3.5" />
            Reply
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-2 ml-4 border-l-2 border-border pl-3 space-y-2.5">
          {loading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {replies.map((r) => (
            <div key={r.id} className={`flex gap-2 ${r._optimistic ? "opacity-50" : ""}`}>
              <Avatar name={r.sender?.name ?? "?"} userId={r.sender?.id} size="2xs" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold">{r.sender?.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTs(r.created_at)}</span>
                </div>
                {r.attachmentUrl ? (
                  <AttachmentBubble msg={r} />
                ) : (
                  <p className="text-xs text-foreground whitespace-pre-wrap break-words">{r.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
          <div className="pt-1">
            <MessageInput onSend={sendReply} placeholder="Reply..." compact />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message item
// ---------------------------------------------------------------------------

async function toggleReaction(
  messageId: string,
  emoji: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
) {
  try {
    const res = await apiFetch(`/api/chat/messages/${messageId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
  } catch {
    /* ignore */
  }
}

async function editMessage(
  messageId: string,
  content: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/chat/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "Failed to edit message");
      return false;
    }
    const data = await res.json();
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: data.content, isEdited: data.isEdited, editedAt: data.editedAt } : m))
    );
    return true;
  } catch {
    toast.error("Failed to edit message");
    return false;
  }
}

function EditHistoryPopover({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<{ content: string; editedAt: string | null }[] | null>(null);

  useEffect(() => {
    if (!open || history) return;
    apiFetch(`/api/chat/messages/${messageId}/edits`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setHistory(data?.history ?? []))
      .catch(() => setHistory([]));
  }, [open, messageId, history]);

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted"
      >
        (edited)
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-1 z-20 bg-popover border rounded-lg shadow-md p-3 w-72 max-h-64 overflow-y-auto space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit History</p>
            {history === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : (
              history.map((h, i) => (
                <div key={i} className="text-xs border-b last:border-0 pb-1.5 last:pb-0">
                  <p className="text-muted-foreground mb-0.5">
                    {h.editedAt ? new Date(h.editedAt).toLocaleString() : "Current"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{h.content}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </span>
  );
}

function ReactionBar({
  msg,
  currentUserId,
  onReact,
}: {
  msg: ChatMessage;
  currentUserId: string;
  onReact: (emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactions = msg.reactions ?? [];

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1 relative">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          className={`text-xs rounded-full px-1.5 py-0.5 border flex items-center gap-1 transition-colors ${
            r.userIds.includes(currentUserId)
              ? "bg-primary/15 border-primary/40"
              : "bg-muted/60 border-transparent hover:bg-muted"
          }`}
        >
          <span>{r.emoji}</span>
          <span className="text-[10px] text-muted-foreground">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="hidden group-hover:inline-flex text-muted-foreground hover:text-foreground rounded-full p-1 hover:bg-muted"
          title="Add reaction"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute bottom-full left-0 mb-1 z-20 bg-popover border rounded-lg shadow-md px-1.5 py-1 flex gap-0.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setPickerOpen(false);
                  }}
                  className="text-lg hover:scale-125 transition-transform p-0.5"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MessageItem({
  msg,
  grouped = false,
  compact = false,
  currentUserId,
  currentUserName,
  isDirectChannel = false,
  otherUserLastReadAt = null,
  onReact,
  onEdit,
}: {
  msg: ChatMessage;
  grouped?: boolean;
  /** Smaller avatar + narrower gutter, used for thread replies so they read
   * as visually subordinate to the parent message they're replying to. */
  compact?: boolean;
  currentUserId: string;
  currentUserName: string;
  /** Whether the active channel is a 1:1 DM — double-check marks only make
   * sense there (group "seen by N" semantics are out of scope for now). */
  isDirectChannel?: boolean;
  otherUserLastReadAt?: string | null;
  onReact?: (emoji: string) => void;
  onEdit?: (content: string) => Promise<boolean>;
}) {
  const online = isOnline(msg.sender?.online_at);
  const threadCount = msg.thread_count ?? 0;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const gutterWidth = compact ? "w-7" : "w-9";
  const isOwn = msg.sender?.id === currentUserId;
  const seen = !!(otherUserLastReadAt && new Date(otherUserLastReadAt) >= new Date(msg.created_at));
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(msg.content);
  const [saving, setSaving] = useState(false);
  const withinEditWindow = Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
  const canEdit = isOwn && !msg.attachmentUrl && !msg._optimistic && onEdit && withinEditWindow;

  async function handleSaveEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === msg.content) {
      setIsEditing(false);
      setEditValue(msg.content);
      return;
    }
    setSaving(true);
    const ok = await onEdit!(trimmed);
    setSaving(false);
    if (ok) setIsEditing(false);
  }

  return (
    <div
      className={`group flex gap-3 hover:bg-muted/40 transition-colors relative ${
        compact ? "pl-8 pr-4" : "px-4"
      } ${
        grouped ? "py-0.5" : "py-1.5 mt-1.5"
      }`}
    >
      {/* Avatar — only shown for the first message in a consecutive run from
          the same sender, Slack-style; grouped messages show the time on
          hover in the same column instead. */}
      <div className={`relative flex-shrink-0 ${gutterWidth}`}>
        {grouped ? (
          <span className="hidden group-hover:block text-[10px] text-muted-foreground text-center leading-9 select-none">
            {time}
          </span>
        ) : (
          <div className="mt-0.5">
            <Avatar name={msg.sender?.name ?? "?"} userId={msg.sender?.id} size={compact ? "sm" : "md"} />
            {online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm">{msg.sender?.name}</span>
            <span className="text-xs text-muted-foreground">{formatTs(msg.created_at)}</span>
          </div>
        )}
        {isEditing ? (
          <div className="space-y-1.5 max-w-lg">
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditValue(msg.content);
                }
              }}
              className="w-full text-sm rounded-md border bg-background px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              disabled={saving}
            />
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit} disabled={saving}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setIsEditing(false); setEditValue(msg.content); }}
                disabled={saving}
              >
                Cancel
              </Button>
              <span className="text-[11px] text-muted-foreground">Enter to save · Esc to cancel</span>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-1.5">
            {msg.attachmentUrl ? (
              <AttachmentBubble msg={msg} />
            ) : (
              <p
                className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                  msg._optimistic ? "opacity-50" : ""
                }`}
              >
                {msg.content}
              </p>
            )}
            {msg.isEdited && !msg._optimistic && <EditHistoryPopover messageId={msg.id} />}
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="hidden group-hover:inline text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted shrink-0"
              >
                Edit
              </button>
            )}
            {isDirectChannel && isOwn && !msg._optimistic && (
              <span title={seen ? "Seen" : "Sent"} className="shrink-0 mb-0.5">
                {seen ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </span>
            )}
          </div>
        )}

        {!msg._optimistic && onReact && <ReactionBar msg={msg} currentUserId={currentUserId} onReact={onReact} />}

        {/* Reply / thread composer — always available (shows just "Reply" on
            hover when there are no replies yet), expands in place under this
            message rather than opening a separate panel. */}
        {!msg._optimistic && (
          <ThreadComposer
            count={threadCount}
            channelId={msg.channel_id}
            parentId={msg.id}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachment bubble — image preview or a file card, shown in place of text
// ---------------------------------------------------------------------------

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentBubble({ msg }: { msg: ChatMessage }) {
  if (msg._uploading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg px-3 py-2 max-w-xs">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span className="truncate">Uploading {msg.attachmentName}...</span>
      </div>
    );
  }

  const isImage = (msg.attachmentType ?? "").startsWith("image/");

  if (isImage) {
    return (
      <a href={msg.attachmentUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={msg.attachmentUrl ?? ""}
          alt={msg.attachmentName ?? "Image attachment"}
          className="max-w-xs max-h-64 rounded-lg border object-cover hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  return (
    <a
      href={msg.attachmentUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 text-sm bg-muted/50 border rounded-lg px-3 py-2.5 max-w-xs hover:bg-muted transition-colors"
    >
      <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{msg.attachmentName}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(msg.attachmentSize)}</p>
      </div>
      <Download className="w-4 h-4 text-muted-foreground shrink-0" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Message input
// ---------------------------------------------------------------------------

const EMOJI_OPTIONS = [
  "😀", "😂", "😊", "😍", "🤔", "😢", "😮", "😡",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "👋",
  "❤️", "🔥", "🎉", "✅", "⭐", "💯", "🚀", "😅",
  "😴", "🤗", "🤯", "🥳", "😎", "🙄", "😬", "🤦",
];

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Add emoji"
        >
          <Smile className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-2">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-lg rounded hover:bg-muted p-1 transition-colors"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MessageInput({
  onSend,
  onSendFile,
  placeholder,
  disabled,
  compact = false,
}: {
  onSend: (content: string) => void;
  onSendFile?: (file: File) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Smaller, chrome-free variant used for inline thread replies. */
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = text.trim();
      if (trimmed) {
        onSend(trimmed);
        setText("");
      }
    }
  }

  function handleSend() {
    const t = text.trim();
    if (t) {
      onSend(t);
      setText("");
      ref.current?.focus();
    }
  }

  function handleEmojiPick(emoji: string) {
    setText((t) => t + emoji);
    ref.current?.focus();
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && onSendFile) onSendFile(file);
    e.target.value = "";
  }

  return (
    <div className={compact ? "flex-shrink-0" : "px-4 py-3 border-t bg-background flex-shrink-0"}>
      <div
        className={`flex items-end gap-2 bg-muted/40 border rounded-lg ${
          compact ? "px-2 py-1.5" : "px-3 py-2"
        }`}
      >
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
              onChange={handleFilePicked}
            />
            <button
              className="flex-shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach a file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </>
        )}
        <textarea
          ref={ref}
          className="flex-1 resize-none bg-transparent text-sm min-h-[24px] max-h-32 focus:outline-none leading-relaxed"
          placeholder={placeholder ?? "Type a message... (Enter to send, Shift+Enter for new line)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={disabled}
        />
        <EmojiPicker onPick={handleEmojiPick} />
        <button
          className="flex-shrink-0 p-1.5 rounded-md text-primary disabled:opacity-30 hover:bg-primary/10 transition-colors"
          disabled={!text.trim() || disabled}
          onClick={handleSend}
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {!compact && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Enter to send &middot; Shift+Enter for new line
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread panel
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sidebar section
// ---------------------------------------------------------------------------

function SidebarSection({
  label,
  channels,
  activeId,
  onSelect,
  actions,
  onArchive,
  onDelete,
}: {
  label: string;
  channels: Channel[];
  activeId: string | null;
  onSelect: (ch: Channel) => void;
  actions?: React.ReactNode;
  onArchive?: (ch: Channel, archived: boolean) => void;
  onDelete?: (ch: Channel) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-2 mb-1 group/section">
        <button
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[#8e9297] hover:text-white transition-colors"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          {label}
        </button>
        {actions && (
          <div className="opacity-0 group-hover/section:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="space-y-0.5">
          {channels.map((ch) => (
            <SidebarChannel
              key={ch.id}
              ch={ch}
              active={ch.id === activeId}
              onClick={() => onSelect(ch)}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
          {channels.length === 0 && (
            <p className="px-3 py-1 text-xs text-[#72767d]">None yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChatPage
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Role-aware nav links for the icon rail
// ---------------------------------------------------------------------------

const ADMIN_LINKS = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/dashboard/admin/admissions", label: "Admissions", icon: CheckSquare },
  { href: "/dashboard/admin/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/admin/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/admin/danger-zone", label: "Danger Zone", icon: AlertTriangle },
];
const TEACHER_LINKS = [
  { href: "/dashboard/teacher", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/teacher/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/teacher/gradebook", label: "Gradebook", icon: ClipboardList },
  { href: "/dashboard/teacher/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/dashboard/teacher/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/teacher/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/teacher/reminders", label: "Reminders", icon: AlarmClock },
];
const STUDENT_LINKS = [
  { href: "/dashboard/student", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/student/assignments", label: "Assignments", icon: FileText },
  { href: "/dashboard/student/quizzes", label: "Quizzes", icon: ClipboardList },
  { href: "/dashboard/student/resources", label: "Resources", icon: FolderOpen },
  { href: "/dashboard/student/forum", label: "Forum", icon: MessageSquare },
  { href: "/dashboard/student/transcript", label: "Transcript", icon: Scroll },
];

function DashboardRail({ role }: { role?: string | null }) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);

  const links =
    role === "admin" || role === "super_admin"
      ? ADMIN_LINKS
      : role === "teacher"
      ? TEACHER_LINKS
      : STUDENT_LINKS;

  const dashboardHref =
    role === "admin" || role === "super_admin"
      ? "/dashboard/admin"
      : role === "teacher"
      ? "/dashboard/teacher"
      : "/dashboard/student";

  return (
    <div
      className="flex-shrink-0 flex flex-col h-full overflow-hidden transition-all duration-200"
      style={{ width: expanded ? 200 : 52, backgroundColor: "#0f1117" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className="flex items-center px-2 py-3 border-b border-white/10 flex-shrink-0 gap-2">
        <Link href={dashboardHref}>
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
            style={{ backgroundColor: "#6366f1" }}
            title="Go to Dashboard"
          >
            <GraduationCap className="h-4 w-4 text-white" />
          </div>
        </Link>
        {expanded && (
          <span className="text-white/60 text-xs font-medium truncate">Dashboard</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1.5">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            link.href === dashboardHref
              ? location === link.href
              : location.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href}>
              <div
                title={!expanded ? link.label : undefined}
                className={`flex items-center gap-2.5 px-1.5 py-2 rounded-md cursor-pointer transition-colors text-sm ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/8"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && <span className="truncate">{link.label}</span>}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Chat indicator at bottom */}
      <div className="px-1.5 pb-3 flex-shrink-0">
        <div
          className="flex items-center gap-2.5 px-1.5 py-2 rounded-md bg-white/10 text-white text-sm"
          title={!expanded ? "Chat" : undefined}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          {expanded && <span className="truncate">Chat</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incoming call — rings until accepted, declined, or the caller hangs up
// ---------------------------------------------------------------------------

function IncomingCallBanner({
  call,
  onAccept,
  onDecline,
}: {
  call: IncomingCall;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black/20 px-4">
      <div className="w-full max-w-sm rounded-2xl shadow-2xl bg-card border overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="p-5 flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">Incoming video call</p>
            <p className="text-sm text-muted-foreground truncate">{call.channelName}</p>
          </div>
        </div>
        <div className="flex border-t">
          <button
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-4 w-4" />
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            <Phone className="h-4 w-4" />
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active call — embedded Jitsi, in-app instead of a separate tab
// ---------------------------------------------------------------------------

function ActiveCallOverlay({ call, onEnd }: { call: ActiveCall; onEnd: () => void }) {
  const jitsiUrl = `https://meet.jit.si/${call.jitsiRoom}#config.prejoinPageEnabled=false`;

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a1a] flex-shrink-0">
        <div className="flex items-center gap-2 text-white min-w-0">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-medium truncate">{call.channelName}</span>
        </div>
        <Button size="sm" variant="destructive" onClick={onEnd}>
          <Phone className="h-3.5 w-3.5 mr-1.5 rotate-[135deg]" />
          Leave Call
        </Button>
      </div>
      <iframe
        src={jitsiUrl}
        className="flex-1 w-full border-0"
        allow="camera; microphone; display-capture; fullscreen; autoplay"
        title="Video call"
      />
    </div>
  );
}

export default function ChatPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const messagesBottomRef = useRef<HTMLDivElement>(null);

  const currentUserId: string = (user as any)?.id ?? "";
  const currentUserName: string =
    (user as any)?.full_name ??
    (user as any)?.name ??
    (user as any)?.email ??
    "You";

  // -------------------------------------------------------------------------
  // Derived channel groups
  // -------------------------------------------------------------------------

  const activeChannels = channels.filter((c) => !c.isArchived);
  const archivedChannels = channels.filter((c) => c.isArchived);

  const schoolAndCourseChannels = activeChannels.filter(
    (c) => c.type === "public" || c.type === "course"
  );
  const directChannels = activeChannels.filter((c) => c.type === "direct");
  const privateChannels = activeChannels.filter((c) => c.type === "private");

  // -------------------------------------------------------------------------
  // Fetch channels on mount
  // -------------------------------------------------------------------------

  const fetchChannels = useCallback(async () => {
    try {
      // ?archived=true returns both archived and active channels — we split
      // them client-side so the "Archived" section can still show its
      // contents without a second round trip.
      const res = await apiFetch("/api/chat/channels?archived=true");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load channels (${res.status})`);
      }
      const data: Channel[] = await res.json();
      setChannels(data);
      if (!activeChannel) {
        const firstActive = data.find((c) => !c.isArchived);
        if (firstActive) setActiveChannel(firstActive);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load channels");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  async function archiveChannel(ch: Channel, archived: boolean) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}/archive`, {
        method: "PUT",
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, isArchived: archived } : c)));
      if (archived && activeChannel?.id === ch.id) {
        const nextActive = channels.find((c) => c.id !== ch.id && !c.isArchived) ?? null;
        setActiveChannel(nextActive);
      }
      toast.success(archived ? `Archived "${ch.name}"` : `Unarchived "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  }

  async function deleteChannel(ch: Channel) {
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setChannels((prev) => prev.filter((c) => c.id !== ch.id));
      if (activeChannel?.id === ch.id) {
        const nextActive = channels.find((c) => c.id !== ch.id && !c.isArchived) ?? null;
        setActiveChannel(nextActive);
      }
      toast.success(`Deleted "${ch.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete channel");
    }
  }

  // -------------------------------------------------------------------------
  // Fetch messages when channel changes
  // -------------------------------------------------------------------------

  // Realtime INSERT payloads only carry raw chat_messages columns
  // (sender_id, no joined profile), unlike the REST responses which include
  // a full sender object. Without this cache, a message that arrives live
  // from someone else renders with no name/id -- an unstyled "?" avatar
  // that hashes to a fixed color (green), looking like a broken/inconsistent
  // badge. Populated from every REST response; used to backfill realtime
  // inserts, falling back to a one-time profile fetch for anyone not seen yet.
  const senderCacheRef = useRef<Map<string, ChatMessage["sender"]>>(new Map());

  const cacheSenders = useCallback((msgs: ChatMessage[]) => {
    for (const m of msgs) {
      if (m.sender?.id) senderCacheRef.current.set(m.sender.id, m.sender);
    }
  }, []);

  useEffect(() => {
    if (currentUserId) senderCacheRef.current.set(currentUserId, { id: currentUserId, name: currentUserName });
  }, [currentUserId, currentUserName]);

  const fetchMessages = useCallback(async () => {
    if (!activeChannel) return;
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`);
      if (res.ok) {
        const raw = await res.json();
        const data: ChatMessage[] = (raw as any[]).map(normalizeMessage);
        cacheSenders(data);
        setMessages(data);
      }
    } catch {
      /* ignore */
    }
  }, [activeChannel?.id, cacheSenders]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  // Scroll to bottom when switching channels
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [activeChannel?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // -------------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const sub = supabase
      .channel(`chat-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const raw = payload.new as ChatMessage & { sender_id?: string };
          const cachedSender = raw.sender_id ? senderCacheRef.current.get(raw.sender_id) : undefined;
          const msg: ChatMessage = { ...raw, sender: raw.sender ?? cachedSender ?? { id: raw.sender_id ?? "", name: "" } };

          if (!cachedSender && raw.sender_id) {
            // Not seen this sender before in this session — resolve their
            // profile once, cache it, and patch the message(s) in place
            // instead of leaving the fallback avatar up indefinitely.
            apiFetch(`/api/users/${raw.sender_id}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((profile) => {
                if (!profile) return;
                const resolved = {
                  id: profile.id,
                  name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Unknown",
                  avatar_url: profile.avatarUrl ?? null,
                };
                senderCacheRef.current.set(resolved.id, resolved);
                setMessages((prev) => prev.map((m) => (m.sender?.id === resolved.id ? { ...m, sender: resolved } : m)));
              })
              .catch(() => {});
          }

          if (!msg.thread_parent_id) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (msg.sender?.id !== currentUserId) {
              apiFetch(`/api/chat/channels/${channelId}/read`, { method: "POST" }).catch(() => {});
            }
          } else {
            // Update thread_count on parent
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.thread_parent_id
                  ? { ...m, thread_count: (m.thread_count ?? 0) + 1 }
                  : m
              )
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live read-receipt updates: when the other member of a DM updates their
  // last_read_at, refresh activeChannel.otherUser so the double-check marks
  // flip without needing a manual refetch.
  useEffect(() => {
    if (!activeChannel || activeChannel.type !== "direct" || !activeChannel.otherUser) return;
    const otherUserId = activeChannel.otherUser.id;
    const channelId = activeChannel.id;
    const sub = supabase
      .channel(`chat-read-receipt:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_channel_members",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_at?: string | null };
          if (row.user_id !== otherUserId) return;
          setActiveChannel((prev) =>
            prev && prev.otherUser
              ? { ...prev, otherUser: { ...prev.otherUser, lastReadAt: row.last_read_at ?? null } }
              : prev
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [activeChannel?.id, activeChannel?.type, activeChannel?.otherUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live reaction updates for the active channel's messages.
  useEffect(() => {
    if (!activeChannel) return;
    const channelId = activeChannel.id;
    const sub = supabase
      .channel(`chat-reactions:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_message_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id?: string } | null;
          const messageId = row?.message_id;
          if (!messageId) return;
          apiFetch(`/api/chat/messages/${messageId}/reactions`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (!data) return;
              setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
              );
            })
            .catch(() => {});
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [activeChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Incoming call ringing — subscribed for every channel the user belongs
  // to (not just the one currently open), so a call rings even if you're
  // looking at a different conversation.
  // -------------------------------------------------------------------------

  const channelsRef = useRef<Channel[]>([]);
  channelsRef.current = channels;
  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;
  const activeChannelIdRef = useRef<string | null>(null);
  activeChannelIdRef.current = activeChannel?.id ?? null;

  // Unread tracking: listen for new messages across every channel the user
  // belongs to (not just the one currently open), so a channel you're not
  // looking at shows an unread indicator the moment someone else messages it.
  useEffect(() => {
    const sub = supabase
      .channel("chat-unread-tracker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const msg = payload.new as { channel_id: string; sender_id: string; thread_parent_id?: string | null };
          if (msg.sender_id === currentUserId) return;
          if (msg.thread_parent_id) return; // don't badge on thread replies
          if (msg.channel_id === activeChannelIdRef.current) return;
          const isMember = channelsRef.current.some((c) => c.id === msg.channel_id);
          if (!isMember) return;
          setChannels((prev) =>
            prev.map((c) =>
              c.id === msg.channel_id ? { ...c, unread_count: (c.unread_count ?? 0) + 1 } : c
            )
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [currentUserId]);

  useEffect(() => {
    const sub = supabase
      .channel("chat-calls-ring")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_calls" },
        (payload) => {
          const call = payload.new as {
            id: string;
            channel_id: string;
            jitsi_room: string;
            status: string;
            started_by?: string | null;
          };
          if (call.status !== "active" || call.started_by === currentUserId) return;
          const channel = channelsRef.current.find((c) => c.id === call.channel_id);
          if (!channel) return; // not a member of this channel — ignore
          setIncomingCall({
            id: call.id,
            jitsiRoom: call.jitsi_room,
            channelId: call.channel_id,
            channelName: channel.name,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_calls" },
        (payload) => {
          const call = payload.new as { id: string; status: string };
          if (call.status !== "ended") return;
          // The call was ended (by anyone) before or while we were on it —
          // close it out on our side too instead of leaving a dead call up.
          if (activeCallRef.current?.id === call.id) setActiveCall(null);
          setIncomingCall((prev) => (prev?.id === call.id ? null : prev));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Simple ringtone using the Web Audio API (no audio asset needed) — plays
  // a two-tone chime, repeating while a call is ringing unanswered.
  useEffect(() => {
    if (!incomingCall) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return;
    }
    const playChime = () => {
      if (!ctx) return;
      [880, 660].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.15, ctx!.currentTime + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx!.currentTime + i * 0.25 + 0.22);
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.start(ctx!.currentTime + i * 0.25);
        osc.stop(ctx!.currentTime + i * 0.25 + 0.25);
      });
    };
    playChime();
    const interval = setInterval(playChime, 2500);
    return () => {
      clearInterval(interval);
      ctx?.close().catch(() => {});
    };
  }, [incomingCall?.id]);

  // -------------------------------------------------------------------------
  // Online presence ping
  // -------------------------------------------------------------------------

  useEffect(() => {
    const ping = async () => {
      try {
        await apiFetch("/api/users/me/online", { method: "PUT" });
      } catch {
        /* ignore */
      }
    };
    ping();
    const iv = setInterval(ping, 30_000);
    return () => clearInterval(iv);
  }, []);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  async function sendAttachment(file: File) {
    if (!activeChannel) return;
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: optimisticId,
      channel_id: activeChannel.id,
      content: file.name,
      created_at: new Date().toISOString(),
      attachmentName: file.name,
      attachmentType: file.type,
      attachmentSize: file.size,
      sender: { id: currentUserId, name: currentUserName },
      _optimistic: true,
      _uploading: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/chat/channels/${activeChannel.id}/attachments`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const saved = normalizeMessage(await res.json());
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? saved : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error(err instanceof Error ? err.message : "Failed to send file");
    }
  }

  async function sendMessage(content: string) {
    if (!activeChannel) return;
    const optimistic: ChatMessage = {
      id: `opt-${Date.now()}`,
      channel_id: activeChannel.id,
      content,
      created_at: new Date().toISOString(),
      sender: { id: currentUserId, name: currentUserName },
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await apiFetch(`/api/chat/channels/${activeChannel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  }

  // -------------------------------------------------------------------------
  // Video call — rings other channel members instead of just opening a tab;
  // the call itself is embedded in-app rather than a separate Jitsi tab.
  // -------------------------------------------------------------------------

  async function startVideoCall() {
    if (!activeChannel) return;
    try {
      const res = await apiFetch("/api/video/chat-calls", {
        method: "POST",
        body: JSON.stringify({ channel_id: activeChannel.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setActiveCall({
        id: data.id,
        jitsiRoom: data.jitsi_room,
        channelId: activeChannel.id,
        channelName: activeChannel.name,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start video call");
    }
  }

  function joinCall() {
    if (!activeChannel?.active_call?.jitsi_room) return;
    setActiveCall({
      id: "",
      jitsiRoom: activeChannel.active_call.jitsi_room,
      channelId: activeChannel.id,
      channelName: activeChannel.name,
    });
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    setActiveCall({
      id: incomingCall.id,
      jitsiRoom: incomingCall.jitsiRoom,
      channelId: incomingCall.channelId,
      channelName: incomingCall.channelName,
    });
    setIncomingCall(null);
  }

  function declineIncomingCall() {
    setIncomingCall(null);
  }

  async function endActiveCall() {
    const call = activeCall;
    setActiveCall(null);
    if (call?.id) {
      try {
        await apiFetch(`/api/video/chat-calls/${call.id}/end`, { method: "PUT" });
      } catch {
        /* the call still ends locally either way */
      }
    }
  }

  // -------------------------------------------------------------------------
  // Channel helpers
  // -------------------------------------------------------------------------

  function handleChannelCreated(ch: Channel) {
    setChannels((prev) => {
      if (prev.find((c) => c.id === ch.id)) return prev;
      return [...prev, ch];
    });
    setActiveChannel(ch);
  }

  async function openDmWith(userId: string, name: string): Promise<boolean> {
    try {
      const res = await apiFetch("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify({ name, type: "direct", memberIds: [userId] }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // DM already exists — find it in state or re-fetch then select it
        const existingId: string = body.channelId;
        const local = channels.find((c) => c.id === existingId);
        if (local) {
          selectChannel(local);
        } else {
          const r2 = await apiFetch("/api/chat/channels");
          if (r2.ok) {
            const all: Channel[] = await r2.json();
            setChannels(all);
            const found = all.find((c) => c.id === existingId);
            if (found) selectChannel(found);
          }
        }
        return true;
      }
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      handleChannelCreated(body as Channel);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open conversation");
      return false;
    }
  }

  async function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setMessages([]);
    setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, unread_count: 0 } : c)));
    apiFetch(`/api/chat/channels/${ch.id}/read`, { method: "POST" }).catch(() => {});
    try {
      const res = await apiFetch(`/api/chat/channels/${ch.id}`);
      if (res.ok) {
        const detail: Channel = await res.json();
        setActiveChannel({ ...detail, unread_count: 0 });
        setChannels((prev) => prev.map((c) => (c.id === detail.id ? { ...detail, unread_count: 0 } : c)));
      }
    } catch {
      /* ignore */
    }
  }

  const topMessages = messages.filter((m) => !m.thread_parent_id);

  // Each distinct speaker in this conversation gets a color the first time
  // they're seen anywhere (main feed, inline thread preview, or the full
  // thread panel) — see useParticipantColorRegistry above.
  const participantColorRegistry = useParticipantColorRegistry(activeChannel?.id ?? null);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <ParticipantColorContext.Provider value={participantColorRegistry}>
    {incomingCall && (
      <IncomingCallBanner
        call={incomingCall}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
      />
    )}
    {activeCall && <ActiveCallOverlay call={activeCall} onEnd={endActiveCall} />}
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ------------------------------------------------------------------ */}
      {/* Dashboard icon rail (Supabase-style) — hidden on mobile once a
          conversation is open, so it doesn't obstruct it like a native app */}
      {/* ------------------------------------------------------------------ */}
      <div className={activeChannel ? "hidden md:flex" : "flex"}>
        <DashboardRail role={user?.role} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Chat Sidebar — full-width on mobile when no conversation is open,
          hidden on mobile once one is (single-pane, like a native app) */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`flex-shrink-0 flex-col overflow-hidden w-full md:w-[240px] ${
          activeChannel ? "hidden md:flex" : "flex"
        }`}
        style={{ backgroundColor: "#1e1e2e" }}
      >
        {/* Workspace header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex-shrink-0 flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shadow-sm shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-white text-base leading-tight truncate">Chat</h1>
            <p className="text-[#8e9297] text-xs truncate">Learning Community</p>
          </div>
        </div>

        {/* People search */}
        <div className="pt-2 flex-shrink-0">
          <PeopleSearch onOpenDm={openDmWith} directChannels={directChannels} />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <SidebarSection
            label="Channels"
            channels={schoolAndCourseChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
          />
          <SidebarSection
            label="Direct Messages"
            channels={directChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
            actions={<NewChannelDialog onCreated={handleChannelCreated} onOpenDm={openDmWith} />}
            onArchive={archiveChannel}
            onDelete={deleteChannel}
          />
          <SidebarSection
            label="Private Channels"
            channels={privateChannels}
            activeId={activeChannel?.id ?? null}
            onSelect={selectChannel}
            actions={<NewChannelDialog onCreated={handleChannelCreated} onOpenDm={openDmWith} />}
            onArchive={archiveChannel}
            onDelete={deleteChannel}
          />
          {archivedChannels.length > 0 && (
            <SidebarSection
              label="Archived"
              channels={archivedChannels}
              activeId={activeChannel?.id ?? null}
              onSelect={selectChannel}
              onArchive={archiveChannel}
              onDelete={deleteChannel}
            />
          )}
        </nav>

        {/* Current user */}
        {currentUserName && (
          <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <Avatar name={currentUserName} size="sm" />
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 rounded-full" style={{ borderColor: "#1e1e2e" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{currentUserName}</p>
              <p className="text-xs text-[#72767d]">Online</p>
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main area */}
      {/* ------------------------------------------------------------------ */}
      {activeChannel ? (
        <div className="flex flex-1 min-w-0">
          {/* Messages column */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Channel header */}
            <header className="flex items-center justify-between px-3 md:px-5 py-3 border-b bg-background flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setActiveChannel(null)}
                  className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-muted text-muted-foreground shrink-0"
                  title="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <ChannelIcon type={activeChannel.type} className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <h2 className="font-bold text-base truncate leading-tight">{activeChannel.name}</h2>
                  {activeChannel.type === "direct" && activeChannel.otherUser && (
                    <span
                      className={`text-xs leading-tight truncate ${
                        isOnline(activeChannel.otherUser.onlineAt) ? "text-green-600 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {formatLastSeen(activeChannel.otherUser.onlineAt)}
                    </span>
                  )}
                </div>
                {activeChannel.member_count != null && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {activeChannel.member_count}{" "}
                    {activeChannel.member_count !== 1 ? "members" : "member"}
                  </span>
                )}
                {activeChannel.description && (
                  <>
                    <span className="text-muted-foreground/40 text-sm">|</span>
                    <span className="text-sm text-muted-foreground truncate">{activeChannel.description}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {activeChannel.active_call ? (
                  <Button size="sm" onClick={joinCall}>
                    <Phone className="w-4 h-4 mr-1.5" />
                    Join Call
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={startVideoCall}>
                    <Phone className="w-4 h-4 mr-1.5" />
                    Video Call
                  </Button>
                )}
                <NotificationBell />
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-4">
              {topMessages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ChannelIcon type={activeChannel.type} className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">
                    Welcome to #{activeChannel.name}!
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    This is the beginning of the #{activeChannel.name} channel. Send a message to get started.
                  </p>
                </div>
              )}
              <div className="space-y-0.5">
                {topMessages.map((m, i) => {
                  const prev = topMessages[i - 1];
                  const grouped =
                    !!prev &&
                    prev.sender?.id === m.sender?.id &&
                    new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
                      5 * 60 * 1000;
                  return (
                    <MessageItem
                      key={m.id}
                      msg={m}
                      grouped={grouped}
                      currentUserId={currentUserId}
                      currentUserName={currentUserName}
                      isDirectChannel={activeChannel.type === "direct"}
                      otherUserLastReadAt={activeChannel.otherUser?.lastReadAt ?? null}
                      onReact={(emoji) => toggleReaction(m.id, emoji, setMessages)}
                      onEdit={(content) => editMessage(m.id, content, setMessages)}
                    />
                  );
                })}
              </div>
              <div ref={messagesBottomRef} />
            </div>

            {/* Message input */}
            <MessageInput
              onSend={sendMessage}
              onSendFile={sendAttachment}
              placeholder={`Message ${activeChannel.type === "direct" ? "" : "#"}${activeChannel.name}`}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 relative flex items-center justify-center">
          <div className="absolute top-3 right-3 md:right-5">
            <NotificationBell />
          </div>
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-100 to-pink-100 flex items-center justify-center mx-auto">
              <MessageSquare className="w-10 h-10 text-orange-400" />
            </div>
            <h2 className="text-xl font-semibold">No channel selected</h2>
            <p className="text-muted-foreground text-sm">
              Pick a channel from the sidebar to start chatting.
            </p>
          </div>
        </div>
      )}
    </div>
    </ParticipantColorContext.Provider>
  );
}
