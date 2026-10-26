# Famora implementation and verification

Updated on October 26, 2026 (America/Toronto).

## Theme, interaction and Android work

The web shell now uses a Google-inspired Material palette, navigation pills,
search toolbar, light/dark themes and responsive workspace cards. Navigation
shows feedback immediately. Workspace creation, editing, deletion and voting
update optimistically and restore drafts/data when the server rejects a change.
Authorization is memoized within a request, with activity writes sampled at
five-minute intervals. Background refresh pauses while a form is being edited.

The vanilla React Native Android project implements phone-native workspaces,
calendar/event details, family chat, DMs, notifications, search, settings,
profile and administration. Native services provide encrypted session storage,
PKCE, file picking, downloads, date/time dialogs and voice recording. Its bearer
API validates Supabase identity and reuses the web application's permission
checks. Native multipart uploads are limited to 4 MB to fit Vercel's request
limit. `npm run android:apk` produces an installable, bundled APK.

Verification so far: 74 web unit/component tests, 9 native unit/component tests,
12 authenticated web workflows, 3 authenticated bearer API workflows, and
desktop/phone visual checks passed. APK/device and final publication checks are
tracked separately until they finish; these counts do not imply that every
planned feature below has been implemented.

## Implemented workflows

| Area           | Functionality                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home           | Persisted upcoming events, open tasks, announcements, permission-aware shortcuts                                                                                                                                    |
| Tasks          | Create/edit/delete, status and priority, deadlines, assignment, completion history, search/filter                                                                                                                   |
| Notebooks      | Family and private pages, editing, version snapshots, history and restoration                                                                                                                                       |
| Contacts       | Contact details, categories, emergency labels, create/edit/delete and search                                                                                                                                        |
| Recipes        | Ingredients, instructions, prep/cooking times, servings, create/edit/delete                                                                                                                                         |
| Announcements  | Draft, published, archived and scheduled notices, expiry, priorities                                                                                                                                                |
| Files          | Validated uploads up to 10 MB, folders, renaming, signed downloads, soft deletion                                                                                                                                   |
| Memories       | Validated photo/video uploads, albums, captions, dates, editing and deletion                                                                                                                                        |
| Polls          | Creation, single/multiple choice, anonymous results, deadlines, voting and closing                                                                                                                                  |
| DMs            | Participant-only conversations, sending, in-app notifications and optional read receipts                                                                                                                            |
| Notifications  | Personal inbox, mark-one/all-read, category preferences; task/announcement/DM notices                                                                                                                               |
| Search         | Permission-aware search across tasks, family/private notes, recipes, files, contacts and events                                                                                                                     |
| Agenda         | Day/week/month/year/agenda views, range loading, CRUD, categories, recurrence, RSVP, checklist, comments, file references, overlap layout, dragging/resizing one-off events, optimistic moves and version conflicts |
| Settings       | Profile/avatar, persisted appearance/accessibility, chat behavior, privacy, date formats, sorting, starting page, calendar default, account information, global sign-out                                            |
| Administration | Whitelist, member access, roles, permission overrides, tool flags, family settings, chat restrictions, audit history and aggregate counts                                                                           |

Every new server mutation validates inputs and resolves current membership and
permissions. Family resources are scoped by family; personal notebooks by owner;
DMs by participation. Access changes require explicit confirmation in the app.
Hidden-admin roles are excluded from member/admin selection lists and audit
projections; only the holder's role settings disclose their own internal role.

## Verification

- Unit/component tests cover authorization, session provisioning, validation,
  notebook privacy, poll ownership, stale calendar edits, recurrence/DST,
  form submission/error preservation and repeated-label accessibility.
- Authenticated Playwright tests use a disposable family and two test accounts
  in the configured Supabase project. They exercise real browser → server action
  → Postgres/Storage → rendered response flows. Cleanup removes fixture data,
  uploaded objects, authentication accounts and browser sessions.
- Live realtime integration tests verify membership isolation, hidden-admin
  projection, broadcasts, changes/deletes, reconnect reconciliation and upload
  staging ownership.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:validate` and
  `pnpm db:verify-migrations` provide static/build/schema checks.

Run `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, and
`pnpm test:e2e:auth`. The last two live suites need a reachable Supabase project;
the authenticated suite requires its service-role key for disposable fixtures.
Never commit `e2e/.auth`, `.env`, or browser traces containing sessions.

## Remaining release work

The detailed agenda document is larger than the implemented core workflows.
It still requires per-calendar sharing/permissions, recurring-instance editing,
calendar import/export and synthetic birthday/task/holiday feeds. Recurrence
editing currently applies to the entire series; dragging/resizing is limited to
one-off events. Calendar refresh uses polling rather than realtime subscriptions.

Reminder records are saved, but timed reminder delivery needs a worker/scheduler.
Browser push and email notifications are not delivered. Notebook editing is
plain text stored as structured document JSON, without collaborative rich-text
editing. Recycle-bin restoration for deleted resources, bulk operations,
ownership transfer and emergency-security automation remain future work.

These are explicit limits: replacing all stub routes does not satisfy every
item in the exhaustive agenda specification.
