"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Emojis offered in the picker grid (composer insert + message reactions). */
export const EMOJI_GRID = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤔", "🤗", "😭", "😅", "🥹",
  "🙂", "😉", "😌", "😴", "🥳", "😳", "😮", "🙃", "😤", "😡", "🤯", "😱", "🥺", "😬", "🤝",
  "👍", "👎", "👏", "🙌", "👋", "💪", "🤞", "✌️", "❤️", "🧡", "💛", "💚", "💙", "💜",
  "🖤", "💯", "🔥", "✨", "🎉", "🎊", "🙏", "🎂", "🍕", "☕", "🌹", "🌈", "⭐", "⚽",
  "🏆", "🚀", "🎁", "💔",
] as const;

/** Shortcut reactions shown on message hover. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏"] as const;

type EmojiPickerProps = {
  trigger: React.ReactNode;
  onSelect: (emoji: string) => void;
  align?: "start" | "center" | "end";
};

/** Dropdown picker grid of emojis; selecting one closes the menu. */
export function EmojiPicker({ trigger, onSelect, align = "end" }: EmojiPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 max-w-[calc(100vw-2rem)]">
        <div className="grid max-h-56 grid-cols-7 gap-0.5 overflow-y-auto p-1" role="listbox">
          {EMOJI_GRID.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              asChild
              onSelect={() => onSelect(emoji)}
              className="justify-center p-1 text-lg leading-none"
            >
              <button type="button" aria-label={`Emoji ${emoji}`}>
                {emoji}
              </button>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}