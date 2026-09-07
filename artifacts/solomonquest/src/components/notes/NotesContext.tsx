import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { Note } from "./types";

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

interface NotesContextValue {
  notes: Note[];
  loading: boolean;
  refresh: () => Promise<void>;
  createNote: () => Promise<Note | null>;
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authedFetch("/api/notes");
      const data = await res.json();
      if (res.ok) setNotes(data.notes ?? []);
    } catch {
      // ignore — widget shows empty state
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createNote = useCallback(async (): Promise<Note | null> => {
    const res = await authedFetch("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "", content: "" }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    setNotes((prev) => [data, ...prev]);
    return data as Note;
  }, []);

  const updateNote = useCallback(async (id: string, patch: Partial<Note>) => {
    // Optimistic update
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    const res = await authedFetch(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...data } : n)));
    }
  }, []);

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await authedFetch(`/api/notes/${id}`, { method: "DELETE" });
  }, []);

  return (
    <NotesContext.Provider value={{ notes, loading, refresh, createNote, updateNote, deleteNote }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within a NotesProvider");
  return ctx;
}

export { authedFetch as notesAuthedFetch };
