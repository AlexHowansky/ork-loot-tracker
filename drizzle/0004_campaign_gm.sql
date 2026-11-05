CREATE TABLE `campaign_gm` (
	`campaign_id` text NOT NULL,
	`gm_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`campaign_id`, `gm_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gm_id`) REFERENCES `gm`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_gm_gm_idx` ON `campaign_gm` (`gm_id`);--> statement-breakpoint
INSERT INTO `campaign_gm`("campaign_id", "gm_id", "created_at") SELECT "id", "gm_id", "created_at" FROM `campaign`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`background_image` text,
	`currency_label` text DEFAULT 'gp' NOT NULL,
	`currency_decimals` integer DEFAULT 2 NOT NULL,
	`base_reference_url` text,
	`petty_cash` integer DEFAULT 0 NOT NULL,
	`petty_cash_hold` integer DEFAULT 0 NOT NULL,
	`allow_debt` integer DEFAULT false NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_campaign`("id", "name", "start_date", "background_image", "currency_label", "currency_decimals", "base_reference_url", "petty_cash", "petty_cash_hold", "allow_debt", "public", "created_at", "updated_at") SELECT "id", "name", "start_date", "background_image", "currency_label", "currency_decimals", "base_reference_url", "petty_cash", "petty_cash_hold", "allow_debt", "public", "created_at", "updated_at" FROM `campaign`;--> statement-breakpoint
DROP TABLE `campaign`;--> statement-breakpoint
ALTER TABLE `__new_campaign` RENAME TO `campaign`;--> statement-breakpoint
PRAGMA foreign_keys=ON;