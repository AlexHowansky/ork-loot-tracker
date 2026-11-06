ALTER TABLE `cash_entry` ADD `locked_by` integer REFERENCES split(id) ON DELETE set null;--> statement-breakpoint
-- Each hand-written entry is locked by the first split run after it.
UPDATE `cash_entry` SET `locked_by` = (
	SELECT s.`id` FROM `split` s
	WHERE s.`campaign_id` = `cash_entry`.`campaign_id`
		AND s.`created_at` >= `cash_entry`.`created_at`
	ORDER BY s.`created_at`, s.`id`
	LIMIT 1
) WHERE `split_id` IS NULL;
