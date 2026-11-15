-- Backfill the habit tracker from data that already existed (ADR-0023).
INSERT OR IGNORE INTO `activity_events` (`id`, `kind`, `at`, `ref`)
SELECT 'qa-' || `id`, 'quiz_answer', `created_at`, `question_id` FROM `quiz_attempts`
UNION ALL
SELECT 'cr-' || `id`, 'card_review', `reviewed_at`, `card_id` FROM `reviews`
UNION ALL
SELECT 'cq-' || `id`, 'chat_question', `created_at`, `chat_id` FROM `chat_messages` WHERE `role` = 'user'
UNION ALL
SELECT 'ca-' || `id`, 'content_added', `created_at`, `id` FROM `contents`
UNION ALL
SELECT 'es-' || `id`, 'exam_submitted', `submitted_at`, `id` FROM `exam_sessions` WHERE `submitted_at` IS NOT NULL
UNION ALL
SELECT 'sg-' || `id`, 'summary_generated', `updated_at`, `id` FROM `study_sets` WHERE `kind` = 'summary' AND `status` = 'ready'
UNION ALL
SELECT 'ne-' || `content_id`, 'note_edit', `updated_at`, `content_id` FROM `notes`;
