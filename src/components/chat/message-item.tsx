"use client";

import * as React from "react";
import {
  MoreHorizontal,
  Reply,
  Copy,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Bookmark,
  BookmarkCheck,
  MessagesSquare,
  SmilePlus,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, initialsOf } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker, QUICK_REACTIONS } from "@/components/chat/emoji-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/server/queries/chat";
import { toast } from "sonner";

type MessageItemProps = {
  message: ChatMessage;
  canEditOwn: boolean;
  canReact: boolean;
  canDeleteAny: boolean;
  canPin: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, body: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onTogglePin: (messageId: string) => Promise<void>;
  onToggleSave: (messageId: string) => Promise<void>;
};

export function MessageItem({
  message,
  canEditOwn,
  canReact,
  canDeleteAny,
  canPin,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onTogglePin,
  onToggleSave,
}: MessageItemProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.body);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDeleted = Boolean(message.deletedAt);
  const canEditThis = message.isMine && canEditOwn && !isDeleted;
  const canDeleteThis = (message.isMine || canDeleteAny) && !isDeleted;

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setMenuOpen(true), 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.body) {
      setEditing(false);
      return;
    }
    await onEdit(message.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      className="group flex gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/40"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        <AvatarImage src={message.sender?.avatarUrl ?? undefined} alt="" />
        <AvatarFallback>
          {initialsOf(message.sender?.displayName ?? "?")}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            {message.sender?.displayName ?? "Removed member"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(message.createdAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          {message.editedAt && !isDeleted ? (
            <span className="text-[11px] text-muted-foreground">(edited)</span>
          ) : null}
          {message.isPinned ? (
            <Pin className="h-3 w-3 text-primary" aria-label="Pinned" />
          ) : null}
        </div>

        {message.replyTo ? (
          <div className="mt-0.5 truncate rounded border-l-2 border-border pl-2 text-xs text-muted-foreground">
            {message.replyTo.sender?.displayName ?? "Removed member"}:{" "}
            {message.replyTo.body || "(message removed)"}
          </div>
        ) : null}

        {editing ? (
          <div className="mt-1 space-y-1.5">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(message.body);
                }
              }}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void saveEdit()}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "mt-0.5 whitespace-pre-wrap break-words text-sm",
              isDeleted && "italic text-muted-foreground",
            )}
          >
            {isDeleted ? "This message was deleted." : message.body}
          </p>
        )}

        {message.reactions.length > 0 ? (
          <div className="mt-1 flex max-w-full flex-wrap gap-1">
            {message.reactions.map((r) => (
              <Tooltip key={r.emoji}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      if (canReact) void onReact(message.id, r.emoji);
                    }}
                    className={cn(
                      "cursor-default rounded-full border border-border px-1.5 py-0.5 text-xs",
                      r.reactedByMe ? "bg-primary/10 border-primary/40" : "bg-muted",
                    )}
                    aria-label={`${r.emoji} reacted by ${r.members.map((m) => m.displayName).join(", ")}`}
                  >
                    {r.emoji} {r.count}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center">
                  {r.members.map((m) => m.displayName).join(", ")}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>

      {!isDeleted ? (
        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {canReact
            ? QUICK_REACTIONS.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void onReact(message.id, emoji)}
                  className="hidden rounded-md p-1 text-sm hover:bg-accent sm:inline-flex"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))
            : null}
          {canReact ? (
            <EmojiPicker
              align="end"
              onSelect={(emoji) => void onReact(message.id, emoji)}
              trigger={
                <button
                  type="button"
                  className="hidden rounded-md p-1 text-sm hover:bg-accent sm:inline-flex"
                  aria-label="React with another emoji"
                >
                  <SmilePlus className="h-4 w-4" aria-hidden />
                </button>
              }
            />
          ) : null}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label="Message actions"
                onClick={() => setMenuOpen(true)}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onReply(message)}>
                <Reply /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void navigator.clipboard.writeText(message.body);
                  toast.success("Message copied");
                }}
              >
                <Copy /> Copy text
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void onToggleSave(message.id)}
              >
                {message.isSavedByMe ? <BookmarkCheck /> : <Bookmark />}
                {message.isSavedByMe ? "Unsave" : "Save"}
              </DropdownMenuItem>
              {canPin ? (
                <DropdownMenuItem onSelect={() => void onTogglePin(message.id)}>
                  {message.isPinned ? <PinOff /> : <Pin />}
                  {message.isPinned ? "Unpin" : "Pin message"}
                </DropdownMenuItem>
              ) : null}
              {message.sender ? (
                <DropdownMenuItem asChild>
                  <a href={`/dms?with=${message.sender.memberId}`}>
                    <MessagesSquare /> Message {message.sender.displayName.split(" ")[0]}
                  </a>
                </DropdownMenuItem>
              ) : null}
              {canEditThis || canDeleteThis ? <DropdownMenuSeparator /> : null}
              {canEditThis ? (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
              ) : null}
              {canDeleteThis ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onDelete(message.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
