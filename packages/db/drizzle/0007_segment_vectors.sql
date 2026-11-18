-- Segment embeddings in libSQL's native vectors (ADR-0029). 384 dims = multilingual-e5-small.
CREATE TABLE `segment_vectors` (
  `segment_id` text PRIMARY KEY NOT NULL REFERENCES `segments`(`id`) ON DELETE cascade,
  `content_id` text NOT NULL REFERENCES `contents`(`id`) ON DELETE cascade,
  `model` text NOT NULL,
  `embedding` F32_BLOB(384) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `segment_vectors_content_idx` ON `segment_vectors` (`content_id`);
--> statement-breakpoint
CREATE INDEX `segment_vectors_ann_idx` ON `segment_vectors` (libsql_vector_idx(`embedding`, 'metric=cosine'));
