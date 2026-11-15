CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`ref` text
);
--> statement-breakpoint
CREATE INDEX `activity_events_at_idx` ON `activity_events` (`at`);--> statement-breakpoint
CREATE INDEX `activity_events_ref_idx` ON `activity_events` (`kind`,`ref`);