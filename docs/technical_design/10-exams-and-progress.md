# 10. Exams, spaces and progress

Status: Current (Phase 7, space page reshaped in Phase 10). Decisions: ADR-0018, ADR-0019, ADR-0016, ADR-0017. The rest of the space page (chat, dashboard, notes, board, tags, bulk add) is in doc 22.

## Flow

```mermaid
sequenceDiagram
  actor U as Owner
  participant S as /spaces/[id]
  participant A as exam actions<br/>(features/quiz/exam)
  participant C as core usecases/exams
  participant L as LLM (task quiz, grading)
  participant D as SQLite
  U->>S: Contents tab: add contents; Exams tab: New exam
  S->>A: generateExamAction(spaceId, options)
  A->>C: startExamGeneration → set "generating"
  A-->>S: returns at once; after(): runExamGeneration
  C->>L: one generateObject per content (sampled across chapters)
  C->>D: quiz_questions (content_id, chapter topic), set "ready"
  S->>S: polls every 3 s until ready
  U->>A: /exams/[setId] → Start exam
  A->>C: startExam → resume open session or start one (deadline)
  C-->>U: ExamQuestionView[] (answer keys stripped)
  U->>A: Submit (or auto-submit at the deadline)
  A->>C: submitExam → grade objective + free response (LLM)
  C->>D: quiz_attempts, exam_sessions.score
  C-->>U: ExamResult: score, topics, answers, "See this in the source"
```

## Where things live

| Piece                                                            | Path                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Exam domain (`ExamOptions`, `ExamSession`, `toExamQuestionView`) | `packages/core/src/domain/exam.ts`                                                                        |
| Generation, sitting, grading, results                            | `packages/core/src/usecases/exams/exams.ts`                                                               |
| Sampling across chapters, question allocation, chapter lookup    | `packages/core/src/usecases/exams/sampling.ts`                                                            |
| Progress and "Practice weak spots"                               | `packages/core/src/usecases/exams/progress.ts`                                                            |
| Space overview, move content to a space                          | `packages/core/src/usecases/spaces/{spaces,organise}.ts` (doc 22)                                         |
| Exam session repository                                          | `packages/db/src/repositories/exam-session-repository.ts`                                                 |
| Exam UI: dialog, exam list, timed runner, results                | `apps/web/src/features/quiz/exam/` (inside the quiz feature, because it reuses `QuestionInput`, ADR-0012) |
| Space contents UI (Contents tab)                                 | `apps/web/src/features/spaces/space-contents.tsx` (doc 22)                                                |
| Progress UI                                                      | `apps/web/src/features/progress/`                                                                         |
| Routes                                                           | `app/spaces/[id]`, `app/exams/[setId]`, `app/progress`                                                    |
| Deep links to a citation                                         | `app/content/[id]?at=[p.3]` → `features/content-viewer/initial-jump.tsx`                                  |

## Rules worth knowing

- **Answer keys stay on the server until submit.** Never send `QuizQuestion.answer` or `explanation` to an exam page before grading. Use `toExamQuestionView`.
- **A sitting resumes, never restarts.** `startExam` returns the open, unexpired session. A reload keeps the same deadline. Unsent answers are kept in `localStorage`, for that viewer only.
- **Progress per space.** `getProgress(deps, now, { spaceId })` covers only the space's contents' quizzes, its exams and its contents' flashcards. The space dashboard (doc 22) uses it.
- **Scoring:**
  - The score is the mean over **all** questions, with unanswered counted as 0.
  - Topic scores in the results use the same rule.
  - Progress uses the latest attempt per answered question (ADR-0017) across quizzes and exams.
- **Late submits** are accepted and flagged when they arrive more than 60 s after the deadline.
- **Citations** use 1-based `[§n]` for text (ADR-0019). Results link with `?at=` to the exact page, time or paragraph.

## Tests

- `packages/core/src/usecases/exams/exams.test.ts` covers:
  - allocation and sampling;
  - space validation and a failed generation;
  - answer masking and resuming a sitting;
  - grading with unanswered questions;
  - idempotent submit and a late submit with model grading;
  - progress ranking and weak-spot practice.
- `packages/db/src/repositories/contracts.test.ts` covers:
  - `setSpace`;
  - exam sessions;
  - `content_id` set to null when its content is deleted;
  - paragraph numbers filled in on text segments.

## Resolved follow-ups (2026-11-15)

- **Answers hidden in practice quizzes too.** `getQuizQuestions` returns `hideAnswer(q)`; the player shows the key only from the graded result of `submitQuizAnswer`.
- **Stale sets.** `failStaleSets` (`packages/core/src/usecases/study-sets.ts`) marks a summary, quiz, flashcard or exam set that has been `generating` for more than 15 minutes as failed, wherever those lists are read.
- **Radio names.** These were a false alarm: every choice is labelled by its wrapping `<label>`. A browser tool showed the input `value` ("on").
- **One modal.** Every feature uses `Dialog` from `@thoth/ui`: a native `<dialog>` (focus trap, inert page, Escape, focus returned to the opener), rendered only while open.

## Known limits

- A few features still import from another feature (ADR-0012): notes uses summary's `Markdown` and `Callout`, flashcards uses quiz's `TopicFields`, and chat and content-viewer import each other. Move the shared pieces to `@thoth/ui` when next touched.
