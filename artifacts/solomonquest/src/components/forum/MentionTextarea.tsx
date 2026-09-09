import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface MentionUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface MentionTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  mentionedUserIds: string[];
  onMentionedUserIdsChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

function mentionName(u: MentionUser) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "User";
}

/**
 * A plain textarea that turns "@" into a live search over the school's
 * teachers/students/staff/admins. Picking someone inserts "@Full Name " into
 * the text and records their id separately in mentionedUserIds — the
 * server trusts that id list (validated against the caller's own school),
 * not free-text name parsing, since names can collide or be edited after
 * insertion.
 */
export function MentionTextarea({
  id,
  value,
  onChange,
  mentionedUserIds,
  onMentionedUserIdsChange,
  placeholder,
  className,
  minLength,
  required,
  disabled,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  useEffect(() => {
    if (query === null) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/forum/mentionable-users?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (cancelled || !res.ok) return;
      setResults(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);

    const cursor = e.target.selectionStart ?? next.length;
    const beforeCursor = next.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([\w]*)$/);
    if (match) {
      setMentionStart(cursor - match[1].length - 1);
      setQuery(match[1]);
    } else {
      setMentionStart(null);
      setQuery(null);
    }
  }

  function pickUser(u: MentionUser) {
    if (mentionStart === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const inserted = `@${mentionName(u)} `;
    onChange(`${before}${inserted}${after}`);
    onMentionedUserIdsChange(Array.from(new Set([...mentionedUserIds, u.id])));
    setMentionStart(null);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <Textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        minLength={minLength}
        required={required}
        disabled={disabled}
      />
      {query !== null && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((u) => (
            <button
              type="button"
              key={u.id}
              onClick={() => pickUser(u)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
              )}
            >
              <span className="font-medium">{mentionName(u)}</span>
              <span className="text-xs text-muted-foreground capitalize">{u.role?.replace("_", " ")}</span>
            </button>
          ))}
        </div>
      )}
      {mentionedUserIds.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">
          Tagging {mentionedUserIds.length} {mentionedUserIds.length === 1 ? "person" : "people"} — type @ to tag more.
        </p>
      )}
    </div>
  );
}
