CREATE TABLE `contact` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text,
	`opt_in_at` integer,
	`opt_in_source` text,
	`opt_out_at` integer,
	`last_inbound_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_user_phone_uidx` ON `contact` (`user_id`,`phone`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`number_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`direction` text NOT NULL,
	`wa_message_id` text,
	`type` text NOT NULL,
	`body` text,
	`status` text NOT NULL,
	`error_code` integer,
	`error_title` text,
	`status_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`number_id`) REFERENCES `wa_number`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contact`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_number_wa_message_id_uidx` ON `message` (`number_id`,`wa_message_id`);--> statement-breakpoint
CREATE INDEX `message_contact_idx` ON `message` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `message_user_created_idx` ON `message` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wa_number` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`waba_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`display_phone` text NOT NULL,
	`verified_name` text NOT NULL,
	`quality_rating` text DEFAULT 'UNKNOWN' NOT NULL,
	`messaging_tier` text,
	`token_sealed` text NOT NULL,
	`app_secret_sealed` text NOT NULL,
	`webhook_key` text NOT NULL,
	`last_webhook_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wa_number_phone_number_id_uidx` ON `wa_number` (`phone_number_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wa_number_webhook_key_uidx` ON `wa_number` (`webhook_key`);--> statement-breakpoint
CREATE INDEX `wa_number_user_idx` ON `wa_number` (`user_id`);