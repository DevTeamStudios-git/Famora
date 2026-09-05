-- CreateEnum
CREATE TYPE "calendar_kind" AS ENUM ('FAMILY', 'PERSONAL', 'BIRTHDAYS', 'TASKS', 'HOLIDAYS');

-- CreateEnum
CREATE TYPE "calendar_color" AS ENUM ('INDIGO', 'TEAL', 'MOSS', 'AMBER', 'CORAL', 'ROSE', 'VIOLET', 'SKY', 'SLATE');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "calendarId" UUID,
ADD COLUMN     "color" "calendar_color",
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "organizerId" UUID,
ADD COLUMN     "recurrenceEndsAt" TIMESTAMPTZ(6),
ADD COLUMN     "recurrenceExceptions" TIMESTAMPTZ(6)[],
ADD COLUMN     "recurrenceInstanceAt" TIMESTAMPTZ(6),
ADD COLUMN     "recurrenceParentId" UUID,
ADD COLUMN     "status" "event_status" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "timeZone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "ownerId" UUID,
    "kind" "calendar_kind" NOT NULL DEFAULT 'FAMILY',
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(280),
    "color" "calendar_color" NOT NULL DEFAULT 'INDIGO',
    "icon" VARCHAR(32),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_preferences" (
    "calendarId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "colorOverride" "calendar_color",
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "calendar_preferences_pkey" PRIMARY KEY ("calendarId","memberId")
);

-- CreateTable
CREATE TABLE "calendar_event_participants" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID,
    "guestName" VARCHAR(120),
    "guestEmail" VARCHAR(200),
    "rsvp" "rsvp_status" NOT NULL DEFAULT 'NONE',
    "rsvpNote" VARCHAR(280),
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_reminders" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "memberId" UUID,
    "minutesBefore" INTEGER NOT NULL,
    "channel" VARCHAR(16) NOT NULL DEFAULT 'PUSH',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_attachments" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "fileId" UUID,
    "notebookPageId" UUID,
    "addedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_comments" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "calendar_event_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_checklist_items" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" UUID,
    "completedById" UUID,
    "completedAt" TIMESTAMPTZ(6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "calendar_event_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendars_familyId_ownerId_sortOrder_idx" ON "calendars"("familyId", "ownerId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_familyId_ownerId_name_key" ON "calendars"("familyId", "ownerId", "name");

-- CreateIndex
CREATE INDEX "calendar_preferences_memberId_idx" ON "calendar_preferences"("memberId");

-- CreateIndex
CREATE INDEX "calendar_event_participants_memberId_rsvp_idx" ON "calendar_event_participants"("memberId", "rsvp");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_participants_eventId_memberId_key" ON "calendar_event_participants"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_reminders_eventId_memberId_minutesBefore_cha_key" ON "calendar_event_reminders"("eventId", "memberId", "minutesBefore", "channel");

-- CreateIndex
CREATE INDEX "calendar_event_attachments_eventId_idx" ON "calendar_event_attachments"("eventId");

-- CreateIndex
CREATE INDEX "calendar_event_comments_eventId_createdAt_idx" ON "calendar_event_comments"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "calendar_event_checklist_items_eventId_sortOrder_idx" ON "calendar_event_checklist_items"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "calendar_events_calendarId_startAt_idx" ON "calendar_events"("calendarId", "startAt");

-- CreateIndex
CREATE INDEX "calendar_events_familyId_recurrenceRule_recurrenceEndsAt_idx" ON "calendar_events"("familyId", "recurrenceRule", "recurrenceEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_recurrenceParentId_recurrenceInstanceAt_key" ON "calendar_events"("recurrenceParentId", "recurrenceInstanceAt");

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_preferences" ADD CONSTRAINT "calendar_preferences_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_reminders" ADD CONSTRAINT "calendar_event_reminders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_reminders" ADD CONSTRAINT "calendar_event_reminders_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_comments" ADD CONSTRAINT "calendar_event_comments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_comments" ADD CONSTRAINT "calendar_event_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_checklist_items" ADD CONSTRAINT "calendar_event_checklist_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
