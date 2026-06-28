CREATE TABLE `visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`ip` text,
	`user_agent` text,
	`browser` text,
	`os` text,
	`device_type` text,
	`page` text,
	`referrer` text,
	`language` text,
	`accept_language` text,
	`languages` text,
	`timezone` text,
	`screen` text,
	`viewport` text,
	`pixel_ratio` real,
	`cpu_cores` integer,
	`device_memory` real,
	`touch` integer,
	`connection_type` text,
	`country` text,
	`region` text,
	`city` text,
	`postal_code` text,
	`latitude` text,
	`longitude` text,
	`cf_timezone` text,
	`asn` integer,
	`as_organization` text,
	`http_protocol` text,
	`tls_version` text,
	`cf_ray` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visits_created_idx` ON `visits` (`created_at`);
--> statement-breakpoint
CREATE INDEX `visits_ip_idx` ON `visits` (`ip`);
