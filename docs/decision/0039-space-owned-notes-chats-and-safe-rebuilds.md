# ADR-0039: Spaces own notes and chats; migrations run with foreign keys off

- Status: Accepted
- Date: 2026-11-21
- Builds on: ADR-0018, ADR-0022

## Context

Spaces become a place to study, not just a folder. The space gets:

- a chat across all its sources;
- its own notes and whiteboard;
- a dashboard;
- tags, a colour and an icon;
- bulk import.

Notes were keyed by `content_id` alone, and chats required one. Whiteboards already allow a space.

Changing these tables means rebuilding them in SQLite. The Drizzle migrator runs each migration in a transaction, where `PRAGMA foreign_keys` has no effect. `migrateDb` turned foreign keys on _before_ migrating, so `DROP TABLE chats` during a rebuild would have cascade-deleted every chat message.

## Decision

1. **Exactly one owner.**
   - `notes` has its own id and either `content_id` or `space_id`, each unique, with a CHECK that exactly one is set.
   - `chats` follows the same rule (`content_id` or `space_id`).
   - The domain uses `NoteOwner = { contentId } | { spaceId }`. The notes editor takes an owner key `content:<id>` or `space:<id>`, so one `NotesEditor` serves the content page and the space page.
2. **Space chat answers are stored with `thoth:c/` links** (ADR-0038), not with content-relative citation tokens, so each chip opens the right content. Their links go into the backlink index like a note's.
3. **Spaces get `color` and `icon`**, as Hearth accent and icon names, never hex. **Tags** are a `tags` table and a `content_tags` join. A content still belongs to at most one space.
4. **Migrations run with foreign keys off.** `migrateDb` sets `PRAGMA foreign_keys = OFF`, applies the migrations, runs `PRAGMA foreign_key_check` (and fails loudly if any rows break), then turns foreign keys on. Every table rebuild is therefore safe.
5. **Migration 0008** is hand-edited after `drizzle-kit generate`: the copies select `NULL` for the new `space_id`, and give each existing note a random UUID. A test migrates a 0007 database holding a note, a chat and a message, and checks that all three survive.

## Consequences

- Code that read `note.contentId` or `chat.contentId` now handles null. Search skips space notes until Lane 4 adds them.
- Every later rebuild migration gets the foreign-key-safe behaviour for free. A migration that leaves dangling rows stops the app at start-up instead of corrupting data silently.
