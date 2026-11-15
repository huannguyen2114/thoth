-- Full-text search over segments (ADR-0006). Maintained by DrizzleSegmentRepository.replaceForContent.
CREATE VIRTUAL TABLE `chunks_fts` USING fts5(
  `text`,
  `segment_id` UNINDEXED,
  `content_id` UNINDEXED,
  tokenize = 'porter unicode61'
);
