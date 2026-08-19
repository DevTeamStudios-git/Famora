"use client";

import * as React from "react";
import { WifiOff, MessageSquare } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { REALTIME_CHANNELS, REALTIME_POSTGRES_TABLES } from "@/lib/realtime/channels";
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
} from "@/server/actions/chat";
import { toast } from "sonner";

type ChatRoomProps = {
  familyId: string;
  conversationId: string;
  initialMessages: ChatMessage[];
  permissions: {
    canSend: boolean;
    canEditOwn: boolean;
    canReact: boolean;
    canDeleteAny: boolean;
    canPin: boolean;
  };
};

export function ChatRoom({
  familyId,
  conversationId,
  initialMessages,
  permissions,
}: ChatRoomProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [replyingTo, setReplyingTo] = React.useState<ChatMessage | null>(null);
  const [connected, setConnected] = React.useState(true);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);

  function upsertMessage(next: ChatMessage) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === next.id);
      if (idx === -1) return [...prev, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
  }

  // Realtime: the family chat table is written to via Prisma in server
  // actions, but Supabase Realtime reads from the Postgres WAL, so it still
  // sees every insert/update regardless of which client wrote it.
  React.useEffect(() => {
    let active = true;
    let channel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>["channel"]> | null =
      null;

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
        .subscribe((status: string) => {
          if (!active) return;
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
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [familyId, conversationId]);

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

      <MessageComposer
        disabled={!permissions.canSend}
        disabledReason="You don't have permission to send messages in Family Chat."
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
      />
    </div>
  );
}
