"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/types";
import { Search, ChevronDown } from "lucide-react";
import { formatDistanceToNow, differenceInDays } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-slate-500",
};

/**
 * Filter views. The first four are the original status filters; the bottom
 * three are tag/recency-based "today's queue" views that the team actually
 * needs to triage — surfaced from the same dropdown to avoid hiding them
 * behind another menu.
 */
type FilterValue =
  | "all"
  | ConversationStatus
  | "hot"
  | "awaiting"
  | "stale";

const FILTER_OPTIONS: { label: string; value: FilterValue; group: "status" | "queue" }[] = [
  { label: "All", value: "all", group: "status" },
  { label: "Open", value: "open", group: "status" },
  { label: "Pending", value: "pending", group: "status" },
  { label: "Closed", value: "closed", group: "status" },
  { label: "Hot leads", value: "hot", group: "queue" },
  { label: "Awaiting follow-up", value: "awaiting", group: "queue" },
  { label: "Stale", value: "stale", group: "queue" },
];

/**
 * Local widening of Conversation — the inbox fetch pulls the joined
 * tag names so the queue filters below can match by tag without a second
 * query. The type stays inside this file so the rest of the app keeps
 * the original lean Conversation shape.
 */
type ConvTagged = Conversation & {
  contact?: NonNullable<Conversation["contact"]> & {
    contact_tags?: Array<{ tag?: { name: string } | null } | null> | null;
  };
};

function tagNamesOf(c: ConvTagged): Set<string> {
  const out = new Set<string>();
  for (const ct of c.contact?.contact_tags ?? []) {
    const n = ct?.tag?.name;
    if (n) out.add(n);
  }
  return out;
}

// Tags that signal a contact has finished moving through the funnel
// in one direction or another — used to suppress them from "today's
// queue" views so the list doesn't fill up with already-handled people.
const CLOSED_STATE_TAGS = new Set([
  "optout:whatsapp",
  "stage:won",
  "stage:lost",
  "customer:cohort",
  "customer:d2d",
  "customer:alumni",
]);

function hasClosedState(tags: Set<string>): boolean {
  for (const t of tags) if (CLOSED_STATE_TAGS.has(t)) return true;
  return false;
}

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [loading, setLoading] = useState(true);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        // Nest tags through contact so the new queue filters can match
        // by tag name without a second query. PostgREST infers the
        // join from the foreign keys; "tag:tags(name)" renames the
        // inner relation so the JS shape is contact_tags[].tag.name.
        .select(
          "*, contact:contacts(*, contact_tags(tag:tags(name)))",
        )
        // Order by recency: messaged conversations first (newest
        // last_message_at), then never-messaged ones by created_at.
        // `nullsFirst: false` keeps the thousands of last_message_at =
        // NULL rows from sorting to the top; created_at is the tiebreaker
        // so brand-new conversations (no message yet) still surface near
        // the top instead of being buried. The limit caps the initial
        // payload — there's no pagination here, so without it the full
        // conversations table loads on every inbox open.
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  const filtered = useMemo(() => {
    let result = conversations as ConvTagged[];
    const now = new Date();

    if (filter === "open" || filter === "pending" || filter === "closed") {
      result = result.filter((c) => c.status === filter);
    } else if (filter === "hot") {
      // Replied with interest and we haven't yet moved them past the
      // funnel — these are the conversations a human needs to own *now*.
      result = result.filter((c) => {
        const tags = tagNamesOf(c);
        return tags.has("eng:interested") && !hasClosedState(tags);
      });
    } else if (filter === "awaiting") {
      // Post-call but no decision yet — needs a follow-up nudge from
      // the team. Exits the queue automatically once tagged won/lost
      // or moved to customer:*.
      result = result.filter((c) => {
        const tags = tagNamesOf(c);
        return tags.has("stage:call-done") && !hasClosedState(tags);
      });
    } else if (filter === "stale") {
      // Open conversations that have gone quiet for >7 days. Excludes
      // anyone in a closed state so handled contacts don't reappear.
      result = result.filter((c) => {
        if (c.status !== "open") return false;
        const tags = tagNamesOf(c);
        if (hasClosedState(tags)) return false;
        if (!c.last_message_at) return true;
        return differenceInDays(now, new Date(c.last_message_at)) >= 7;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-slate-800 bg-slate-900 lg:w-80">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-slate-800 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search conversations..."
            className="border-slate-700 bg-slate-800 pl-9 text-sm text-white placeholder-slate-500 focus:border-primary/50"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-slate-400 hover:text-white rounded-md hover:bg-slate-800">
              {activeFilter?.label ?? "All"}
              <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="border-slate-700 bg-slate-800"
          >
            {FILTER_OPTIONS.map((opt, i) => {
              const prev = FILTER_OPTIONS[i - 1];
              const showSeparator = prev && prev.group !== opt.group;
              return (
                <span key={opt.value}>
                  {showSeparator && (
                    <DropdownMenuSeparator className="bg-slate-700" />
                  )}
                  <DropdownMenuItem
                    onClick={() => setFilter(opt.value)}
                    className={cn(
                      "text-sm",
                      filter === opt.value
                        ? "text-primary"
                        : "text-slate-300"
                    )}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                </span>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Conversation Items */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-slate-500">No conversations found</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || "Unknown";
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-800/50",
        isActive && "border-l-2 border-primary bg-slate-800/70"
      )}
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-white">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-white">
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-slate-500">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-slate-400">
            {conversation.last_message_text || "No messages yet"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
