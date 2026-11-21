-- Phase 10 contracts (docs/plan/parallel-development.md). Hand-edited after drizzle-kit:
-- the chats and notes copies select NULL for the new space_id, and give each existing note a
-- random UUID v4 id. Runs with foreign keys off (see migrateDb), so the rebuilds keep children.

CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`kind` text NOT NULL,
	`anchor` text NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`comment` text,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `annotations_content_idx` ON `annotations` (`content_id`,`position`);--> statement-breakpoint
CREATE TABLE `content_tags` (
	`content_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`content_id`, `tag_id`),
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_tags_tag_idx` ON `content_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` text PRIMARY KEY NOT NULL,
	`from_kind` text NOT NULL,
	`from_id` text NOT NULL,
	`from_content_id` text,
	`from_space_id` text,
	`label` text NOT NULL,
	`to_content_id` text,
	`to_annotation_id` text,
	`to_set_id` text,
	`anchor` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `links_from_idx` ON `links` (`from_kind`,`from_id`);--> statement-breakpoint
CREATE INDEX `links_to_content_idx` ON `links` (`to_content_id`);--> statement-breakpoint
CREATE INDEX `links_to_annotation_idx` ON `links` (`to_annotation_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_uq` ON `tags` (`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`space_id` text,
	`title` text NOT NULL,
	`instructions` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chats_one_owner" CHECK((content_id IS NULL) <> (space_id IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_chats`("id", "content_id", "space_id", "title", "instructions", "created_at", "updated_at") SELECT "id", "content_id", NULL, "title", "instructions", "created_at", "updated_at" FROM `chats`;--> statement-breakpoint
DROP TABLE `chats`;--> statement-breakpoint
ALTER TABLE `__new_chats` RENAME TO `chats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chats_content_idx` ON `chats` (`content_id`);--> statement-breakpoint
CREATE INDEX `chats_space_idx` ON `chats` (`space_id`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`space_id` text,
	`markdown` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notes_one_owner" CHECK((content_id IS NULL) <> (space_id IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "content_id", "space_id", "markdown", "updated_at") SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), "content_id", NULL, "markdown", "updated_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
CREATE UNIQUE INDEX `notes_content_uq` ON `notes` (`content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_space_uq` ON `notes` (`space_id`);--> statement-breakpoint
ALTER TABLE `spaces` ADD `color` text;--> statement-breakpoint
ALTER TABLE `spaces` ADD `icon` text;