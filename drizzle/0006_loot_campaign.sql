PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_loot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`session_id` integer,
	`name` text NOT NULL,
	`location` text,
	`description` text,
	`link` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`value` integer,
	`market_pct` integer DEFAULT 50 NOT NULL,
	`unidentified` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`character_id` text,
	`split_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`character_id`) REFERENCES `character`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`split_id`) REFERENCES `split`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_loot`("id", "campaign_id", "session_id", "name", "location", "description", "link", "quantity", "value", "market_pct", "unidentified", "status", "character_id", "split_id", "created_at", "updated_at") SELECT l."id", s."campaign_id", l."session_id", l."name", l."location", l."description", l."link", l."quantity", l."value", l."market_pct", l."unidentified", l."status", l."character_id", l."split_id", l."created_at", l."updated_at" FROM `loot` l JOIN `session` s ON s."id" = l."session_id";--> statement-breakpoint
DROP TABLE `loot`;--> statement-breakpoint
ALTER TABLE `__new_loot` RENAME TO `loot`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `loot_campaign_idx` ON `loot` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `loot_session_idx` ON `loot` (`session_id`);--> statement-breakpoint
CREATE INDEX `loot_character_idx` ON `loot` (`character_id`);