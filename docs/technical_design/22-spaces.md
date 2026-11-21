# 22. Spaces: chat, dashboard, notes, board, organising

Status: Stub (Phase 10 Step 0). Lane 4 fills it in and updates doc 10. Decision: ADR-0039.

## Contracts already in place (Step 0)

- `Space.color` and `Space.icon` (Hearth accent and icon names), `SpaceRepository.update`.
- `Chat.spaceId`, `ChatRepository.createForSpace` and `listBySpace`.
- `NoteOwner`; `NoteRepository.get` and `save` take an owner. `NotesEditor` (`apps/web/src/features/notes/tool.tsx`) takes `ownerKey` `content:<id>` or `space:<id>`.
- `Tag`, `TagRepository` and the `tags` and `content_tags` tables.
- The whiteboard table already allows `space_id`.
