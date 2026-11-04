CREATE TABLE `billing_account` (
	`user_id` text PRIMARY KEY NOT NULL,
	`trial_ends_at` integer NOT NULL,
	`paid_until` integer,
	`numbers` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `billing_order` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan` text NOT NULL,
	`numbers` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'doku' NOT NULL,
	`provider_ref` text NOT NULL,
	`payment_url` text,
	`paid_until` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_order_provider_ref_uidx` ON `billing_order` (`provider`,`provider_ref`);--> statement-breakpoint
CREATE INDEX `billing_order_user_created_idx` ON `billing_order` (`user_id`,`created_at`);