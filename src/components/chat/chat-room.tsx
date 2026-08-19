"use client";

import * as React from "react";
import { WifiOff, MessageSquare } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { REALTIME_CHANNELS, REALTIME_POSTGRES_TABLES } from "@/lib/realtime/channels";
import type { TypingPayload } from "@/lib/realtime/channels";
import { EmptyState } from "@/components/core/empty-state";
import { MessageItem } from "@/components/chat/message-item";
import { MessageComposer } from "@/components/chat/message-composer";
import type { ChatMessage } from "@/server/queries/chat";
import {
  sendFamilyMessage,
  editFamilyMessage,
  deleteFamilyMessage,
  toggleMessageReaction,
  togglePinMessage,
  toggleSaveMessage,
  fetchFamilyMessage,
  fetchMessageBySideEffect,
} from "@/server/actions/chat";
import { toast } from "sonner";

type ChatRoomProps = {
  familyId: string;
  conversationId: string;
  viewer: { memberId: string; displayName: string };
  initialMessages: ChatMessage[];
  permissions: {
    canSend: boolean;
    canEditOwn: boolean;
    canReact: boolean;
    canDeleteAny: boolean;
    canPin: boolean;
  };
};

const TYPING_EXPIRY_MS = 4000;

export function ChatRoom({
  familyId,
  conversationId,
  viewer,
  initialMessages,
  permissions,
}: ChatRoomProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [replyingTo, setReplyingTo] = React.useState<ChatMessage | null>(null);
  const [connected, setConnected] = React.useState(true);
  const [typers, setTypers] = React.useState<Record<string, string>>({});
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);
  const messagesRef = React.useRef<ChatMessage[]>(initialMessages);
  const channelRef = React.useRef<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null>(
    null,
  );
  const typingTimersRef = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  function upsertMessage(next: ChatMessage) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === next.id);
      if (idx === -1) return [...prev, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  function clearTypingTimers() {
    for (const timer of typingTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    typingTimersRef.current.clear();
  }

  function setTyping(memberId: string, displayName: string) {
    const existing = typingTimersRef.current.get(memberId);
    if (existing !== undefined) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      typingTimersRef.current.delete(memberId);
      setTypers((prev) => {
        if (!(memberId in prev)) return prev;
        const copy = { ...prev };
        delete copy[memberId];
        return copy;
      });
    }, TYPING_EXPIRY_MS);
    typingTimersRef.current.set(memberId, timer);
    setTypers((prev) => (prev[memberId] === displayName ? prev : { ...prev, [memberId]: displayName }));
  }

  function clearTyping(memberId: string) {
    const timer = typingTimersRef.current.get(memberId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      typingTimersRef.current.delete(memberId);
    }
    setTypers((prev) => {
      if (!(memberId in prev)) return prev;
      const copy = { ...prev };
      delete copy[memberId];
      return copy;
    });
  }

  function broadcastTyping(isTyping: boolean) {
    const payload: TypingPayload = {
      conversationId,
      memberId: viewer.memberId,
      displayName: viewer.displayName,
      isTyping,
    };
    channelRef.current?.send({ type: "broadcast", event: "typing", payload });
  }

  // Reactions and pins live in child tables, so a change never touches the
  // `messages` row. When such a row changes, refetch the affected message if
  // it is still on screen so reactions/pins update without a manual refresh.
  // Reactions and pins live in child tables, so a change never touches the
  // `messages` row. When such a row changes, refetch the affected message if
  // it is still on screen so reactions/pins update without a manual refresh.
  React.useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null =
      null;

    function refetchIfVisible(messageId: string | undefined) {
      if (!messageId || !active) return;
      if (!messagesRef.current.some((m) => m.id === messageId)) return;
      void fetchFamilyMessage(messageId).then((msg) => {
        if (msg && active) upsertMessage(msg);
      });
    }

    // Reactions/pins: INSERT events carry the message id directly; DELETE
    // events only carry the child row's primary key, so resolve it server-side.
    function refreshFromSideEffect(
      payload: { new?: { id?: string; messageId?: string }; old?: { id?: string } },
      kind: "reaction" | "pin",
    ) {
      if (!active) return;
      if (payload.new?.messageId) {
        refetchIfVisible(payload.new.messageId);
        return;
      }
      const rowId = payload.old?.id ?? payload.new?.id;
      if (!rowId) return;
      void fetchMessageBySideEffect(kind, rowId).then((msg) => {
        if (msg && active && messagesRef.current.some((m) => m.id === msg.id)) {
          upsertMessage(msg);
        }
      });
    }

    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel(REALTIME_CHANNELS.familyChat(familyId))
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: REALTIME_POSTGRES_TABLES.messages,
            filter: `conversationId=eq.${conversationId}`,
          },
          (payload: { new?: { id?: string } }) => {
            const id = payload.new?.id;
            if (!id || !active) return;
            void fetchFamilyMessage(id).then((msg) => {
              if (msg && active) upsertMessage(msg);
            });
          },
        )
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (!active) return;
          const typing = payload as TypingPayload;
          if (!typing || typing.memberId === viewer.memberId) return;
          if (typing.isTyping) setTyping(typing.memberId, typing.displayName);
          else clearTyping(typing.memberId);
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: REALTIME_POSTGRES_TABLES.messageReactions,
          },
          (payload: { new?: { id?: string; messageId?: string }; old?: { id?: string } }) => {
            refreshFromSideEffect(payload, "reaction");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: REALTIME_POSTGRES_TABLES.pinnedMessages,
          },
          (payload: { new?: { id?: string; messageId?: string }; old?: { id?: string } }) => {
            refreshFromSideEffect(payload, "pin");
          },
        )
        .subscribe((status: string) => {
          if (!active) return;
          channelRef.current = channel;
          setConnected(status === "SUBSCRIBED");
        });
    } catch {
      // Supabase isn't configured in this environment (e.g. local dev without
      // env vars) — the page still works, just without live updates. Defer
      // the state update out of the synchronous effect body per
      // react-hooks/set-state-in-effect.
      queueMicrotask(() => {
        if (active) setConnected(false);
      });
    }

    return () => {
      active = false;
      clearTypingTimers();
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
      channelRef.current = null;
    };
  }, [familyId, conversationId, viewer.memberId]);

  React.useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function handleSend(body: string) {
    const result = await sendFamilyMessage({
      body,
      replyToId: replyingTo?.id ?? null,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    upsertMessage(result.data);
    setReplyingTo(null);
  }

  async function handleEdit(messageId: string, body: string) {
    const result = await editFamilyMessage(messageId, body);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const fresh = await fetchFamilyMessage(messageId);
    if (fresh) upsertMessage(fresh);
  }

  async function handleDelete(messageId: string) {
    const result = await deleteFamilyMessage(messageId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const fresh = await fetchFamilyMessage(messageId);
    if (fresh) upsertMessage(fresh);
  }

  async function handleReact(messageId: string, emoji: string) {
    const result = await toggleMessageReaction(messageId, emoji);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const fresh = await fetchFamilyMessage(messageId);
    if (fresh) upsertMessage(fresh);
  }

  async function handleTogglePin(messageId: string) {
    const result = await togglePinMessage(messageId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const fresh = await fetchFamilyMessage(messageId);
    if (fresh) upsertMessage(fresh);
  }

  async function handleToggleSave(messageId: string) {
    const result = await toggleSaveMessage(messageId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const fresh = await fetchFamilyMessage(messageId);
    if (fresh) upsertMessage(fresh);
  }

  const typerNames = Object.values(typers);
  const typingLabel =
    typerNames.length === 1
      ? `${typerNames[0]} is typing…`
      : typerNames.length === 2
        ? `${typerNames[0]} and ${typerNames[1]} are typing…`
        : typerNames.length > 2
          ? "Several people are typing…"
          : null;

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      {!connected ? (
        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          Reconnecting…
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-2 py-3" onScroll={handleScroll}>
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Send the first message to start the family conversation."
          />
        ) : (
          <div className="space-y-0.5">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                canEditOwn={permissions.canEditOwn}
                canReact={permissions.canReact}
                canDeleteAny={permissions.canDeleteAny}
                canPin={permissions.canPin}
                onReply={setReplyingTo}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReact={handleReact}
                onTogglePin={handleTogglePin}
                onToggleSave={handleToggleSave}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {typingLabel ? (
        <div className="border-t border-border px-3 pb-1 pt-1.5 text-xs text-muted-foreground">
          <span aria-live="polite">{typingLabel}</span>
        </div>
      ) : null}

      <MessageComposer
        disabled={!permissions.canSend}
        disabledReason="You don't have permission to send messages in Family Chat."
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
        onTypingChange={broadcastTyping}
      />
    </div>
  );
}