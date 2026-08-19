-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderMemberId_fkey" FOREIGN KEY ("senderMemberId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
