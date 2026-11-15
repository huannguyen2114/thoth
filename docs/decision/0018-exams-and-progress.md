# ADR-0018: Space exams with timed sessions, server-only answer keys, progress computed on read

- Status: Accepted
- Date: 2026-11-15

## Context

Phase 7 adds YouLearn's "New Exam": a timed test across several contents of a Space, with a per-topic breakdown, and a progress view that turns weak topics into practice. Three choices shape stored data and trust:

- how an exam and its sittings are stored;
- where the answer key may travel;
- whether progress is stored or computed.

Spaces had no page and contents could not join one, so exams also need space membership.

## Decision

1. **An exam is a `StudySet` of kind `exam` owned by a space.**
   - Its options (`ExamOptions`) hold the chosen content ids, duration, question count, types, difficulty and language.
   - Its questions reuse `quiz_questions`, with a new nullable `content_id` column so every exam question knows its source content.
   - Each question's `topic` is the title of the chapter its citation falls in.
2. **A sitting is an `ExamSession` row** (`exam_sessions`: `started_at`, `deadline_at`, `submitted_at`, `score`).
   - Starting an exam returns the open, unexpired session if there is one, so a reload resumes it.
   - Answers are stored as ordinary `quiz_attempts` when the exam is submitted. A session's attempts are those created inside its time window.
   - An unanswered question scores 0 in the exam score, but stores no attempt.
   - The client auto-submits at the deadline. The server accepts a late submit and records its time.
3. **Answer keys never leave the server before submission.** Exam questions go to the browser as `ExamQuestionView`: the question with its `answer` replaced by an empty value of the same type. Grading reuses the quiz graders (ADR-0017) on the server.
4. **Generation** follows ADR-0016 (create `generating`, run with `after()`, the page polls):
   - Questions are split across the chosen contents in proportion to their text length, at least one each.
   - Each content's source is sampled evenly across its chapters, up to `MAX_SOURCE_CHARS`, instead of only its first pages.
5. **Progress is computed on read** from quiz and exam attempts (latest attempt per question), grouped by content and topic, plus the number of flashcards due. Nothing extra is stored. "Practice weak spots" starts an ordinary quiz on that chapter (ADR-0017) with a focus on the learner's mistakes.
6. **Contents join a space** through `ContentRepository.setSpace`. A content belongs to at most one space.

## Consequences

- No new kind of question table: exam results feed the same topic statistics as quizzes.
- Progress reads scale with the number of sets. That is fine for one learner. Add a summary table if it ever gets slow.
- A session's attempts are found by time window. Two sittings of the same exam can never overlap, so this is exact.
- **Practice quizzes (Phase 5) still send the full question, with its answer, to the browser before answering.** That is acceptable for self-study but inconsistent with point 3. Follow-up: mask quiz answers the same way.
