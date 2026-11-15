CREATE TABLE `exam_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`submitted_at` integer,
	`score` real,
	FOREIGN KEY (`set_id`) REFERENCES `study_sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exam_sessions_set_idx` ON `exam_sessions` (`set_id`,`started_at`);--> statement-breakpoint
ALTER TABLE `quiz_questions` ADD `content_id` text REFERENCES contents(id) ON DELETE set null;