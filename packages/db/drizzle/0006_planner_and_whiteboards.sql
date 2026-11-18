CREATE TABLE `plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`day` text NOT NULL,
	`idx` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`minutes` integer NOT NULL,
	`content_id` text,
	`topic` text,
	`done_at` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `study_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plan_items_plan_idx` ON `plan_items` (`plan_id`,`day`,`idx`);--> statement-breakpoint
CREATE INDEX `plan_items_day_idx` ON `plan_items` (`day`);--> statement-breakpoint
CREATE TABLE `study_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`goal_date` text NOT NULL,
	`minutes_per_day` integer NOT NULL,
	`study_days` text NOT NULL,
	`space_id` text,
	`content_ids` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `whiteboards` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`space_id` text,
	`title` text NOT NULL,
	`elements` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `whiteboards_content_idx` ON `whiteboards` (`content_id`);--> statement-breakpoint
CREATE INDEX `whiteboards_space_idx` ON `whiteboards` (`space_id`);