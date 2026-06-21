CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_seq` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`ts` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_to_ts_idx` ON `messages` (`to_id`,`ts`);
--> statement-breakpoint
CREATE INDEX `messages_from_ts_idx` ON `messages` (`from_id`,`ts`);
--> statement-breakpoint
CREATE INDEX `messages_ts_idx` ON `messages` (`ts`);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `push_user_idx` ON `push_subscriptions` (`user_id`);
