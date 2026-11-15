# 10. Exams, spaces and progress

Status: Current (Phase 7). Decisions: ADR-0018, ADR-0019, ADR-0016, ADR-0017.

## Flow

```mermaid
sequenceDiagram
  actor U as Owner
  participant S as /spaces/[id]
  participant A as exam actions<br/>(features/quiz/exam)
  participant C as core usecases/exams
  participant L as LLM (task quiz, grading)
  participant D as SQLite
  U->>S: add contents to the space, New exam
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
| Space overview, move content to a space                          | `packages/core/src/usecases/spaces.ts`                                                                    |
| Exam session repository                                          | `packages/db/src/repositories/exam-session-repository.ts`                                                 |
| Exam UI: dialog, exam list, timed runner, results                | `apps/web/src/features/quiz/exam/` (inside the quiz feature, because it reuses `QuestionInput`, ADR-0012) |
| Space contents UI                                                | `apps/web/src/features/spaces/space-contents.tsx`                                                         |
| Progress UI                                                      | `apps/web/src/features/progress/`                                                                         |
| Routes                                                           | `app/spaces/[id]`, `app/exams/[setId]`, `app/progress`                                                    |
| Deep links to a citation                                         | `app/content/[id]?at=[p.3]` → `features/content-viewer/initial-jump.tsx`                                  |

## Rules worth knowing

- **Answer keys stay on the server until submit.** Never send `QuizQuestion.answer` or `explanation` to an exam page before grading. Use `toExamQuestionView`.
- **A sitting resumes, never restarts.** `startExam` returns the open, unexpired session. A reload keeps the same deadline. Unsent answers are kept in `localStorage`, for that viewer only.
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

## Known limits and follow-ups

- Practice quizzes (Phase 5) still send answers to the browser before answering (ADR-0018, Consequences).
- A quiz, flashcard or exam set left `generating` by a server restart is not marked failed automatically (ADR-0016 follow-up).
- Quiz and exam radio inputs are named "on" for screen readers. `QuestionInput` should label each choice.
- Summary has its own modal. Move it to the shared `Dialog` in `@thoth/ui`.
