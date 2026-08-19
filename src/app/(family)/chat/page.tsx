import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareOff } from "lucide-react";
import { getAccessState } from "@/lib/auth/session";
import { hasPermission } from "@/lib/authorization/authorization";
import { getFamilyWithFeatures } from "@/server/queries/family";
import { getOrCreateFamilyChatConversation, listFamilyMessages } from "@/server/queries/chat";
import { PageHeader } from "@/components/core/page-header";
import { EmptyState } from "@/components/core/empty-state";
import { ChatRoom } from "@/components/chat/chat-room";

export const metadata: Metadata = { title: "Family Chat" };

export default async function ChatPage() {
  const access = await getAccessState();
  if (access.status !== "authorized") {
    redirect(access.status === "unauthenticated" ? "/login" : "/access-denied");
  }

  const { familyId, memberId, membership } = access;

  const family = await getFamilyWithFeatures(familyId);
  const chatEnabled = family?.features.has("chat") ?? true;

  if (!hasPermission(membership, "chat.read") || !chatEnabled) {
    return (
      <>
        <PageHeader title="Family Chat" description="Realtime family messaging." />
        <div className="mt-6">
          <EmptyState
            icon={MessageSquareOff}
            title={chatEnabled ? "No access to Family Chat" : "Family Chat is disabled"}
            description={
              chatEnabled
                ? "You don't have permission to view Family Chat."
                : "A Family Chief or Co-Chief has turned this tool off for now."
            }
          />
        </div>
      </>
    );
  }

  const conversationId = await getOrCreateFamilyChatConversation(familyId, memberId);
  const messages = await listFamilyMessages(conversationId, memberId);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Family Chat" description="Realtime family messaging." />
      <ChatRoom
        familyId={familyId}
        conversationId={conversationId}
        initialMessages={messages}
        permissions={{
          canSend: hasPermission(membership, "chat.send"),
          canEditOwn: hasPermission(membership, "chat.edit_own"),
          canReact: hasPermission(membership, "chat.react"),
          canDeleteAny: hasPermission(membership, "chat.delete_any_message"),
          canPin: hasPermission(membership, "chat.pin_any_message"),
        }}
      />
    </div>
  );
}
