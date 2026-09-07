import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, X, Send, Loader2, Check, XCircle } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  name: string;
  input: Record<string, unknown>;
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

function actionLabel(action: PendingAction): string {
  if (action.name === "create_reminder") {
    const input = action.input as { message?: string; target_role?: string; send_at?: string };
    return `Schedule a reminder for ${input.target_role ?? "recipients"}: "${input.message ?? ""}"`;
  }
  if (action.name === "create_announcement") {
    const input = action.input as { title?: string };
    return `Post announcement: "${input.title ?? ""}"`;
  }
  if (action.name === "send_broadcast") {
    const input = action.input as { target_role?: string; method?: string; subject?: string; message?: string };
    const via = input.method === "email" ? "email" : "in-app chat";
    return `Send via ${via} to all ${input.target_role ?? "recipients"}s — "${input.subject ?? ""}": ${input.message ?? ""}`;
  }
  return `Perform action: ${action.name}`;
}

export function AgentWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [agentName, setAgentName] = useState("Solomon");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canUseAgent =
    user?.role === "admin" || user?.role === "super_admin" || user?.role === "teacher" || user?.role === "staff";

  useEffect(() => {
    if (!open || !canUseAgent) return;
    authedFetch("/api/agent/settings")
      .then((r) => r.json())
      .then((data) => { if (data.name) setAgentName(data.name); })
      .catch(() => {});
    authedFetch("/api/agent/conversations")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages.map((m: any) => ({ id: m.id ?? crypto.randomUUID(), role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, [open, canUseAgent]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingAction]);

  if (!canUseAgent) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setPendingAction(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await authedFetch("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Agent request failed");

      if (data.message) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.message }]);
      }
      if (data.type === "tool_use" && data.tool) {
        setPendingAction({ name: data.tool.name, input: data.tool.input });
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong talking to the agent");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    try {
      const res = await authedFetch("/api/agent/execute-action", {
        method: "POST",
        body: JSON.stringify({ tool: pendingAction.name, input: pendingAction.input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to perform action");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `✅ ${data.summary}` },
      ]);
      toast.success(data.summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to perform action");
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-24 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex flex-col items-center justify-center gap-0.5 hover:scale-105 transition-transform"
          title={`Chat with ${agentName}`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[9px] font-semibold leading-none">Sol</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-24 z-50 w-full md:w-96 h-[85vh] md:h-[600px] bg-white md:rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold text-sm">{agentName}</span>
            </div>
            <button onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground mt-8">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>
                  Hi, I'm {agentName}. Ask me anything about your school, or ask me to draft a reminder or
                  announcement.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {agentName} is thinking...
              </div>
            )}
            {pendingAction && (
              <div className="mr-auto max-w-[90%] rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900 mb-2">Confirm action</p>
                <p className="text-amber-800 mb-3">{actionLabel(pendingAction)}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleConfirmAction} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPendingAction(null)} disabled={actionLoading}>
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t flex items-center gap-2 shrink-0">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={`Message ${agentName}...`}
              disabled={loading}
            />
            <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
