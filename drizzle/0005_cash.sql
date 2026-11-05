ALTER TABLE `campaign` RENAME COLUMN `petty_cash` TO `cash`;--> statement-breakpoint
ALTER TABLE `campaign` RENAME COLUMN `petty_cash_hold` TO `cash_hold`;--> statement-breakpoint
ALTER TABLE `split` RENAME COLUMN `petty_cash_in` TO `cash_in`;--> statement-breakpoint
ALTER TABLE `petty_cash_entry` RENAME TO `cash_entry`;--> statement-breakpoint
DROP INDEX `petty_cash_entry_campaign_idx`;--> statement-breakpoint
DROP INDEX `petty_cash_entry_session_idx`;--> statement-breakpoint
CREATE INDEX `cash_entry_campaign_idx` ON `cash_entry` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `cash_entry_session_idx` ON `cash_entry` (`session_id`);
