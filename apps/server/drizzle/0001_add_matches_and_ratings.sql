CREATE TABLE `match_players` (
	`match_id` varchar(36) NOT NULL,
	`slot` int NOT NULL,
	`user_id` varchar(36),
	`display_name` varchar(24) NOT NULL,
	`rounds_won` int NOT NULL,
	`outcome` varchar(8) NOT NULL,
	`rating_before` int,
	`rating_after` int,
	CONSTRAINT `match_players_match_id_slot_pk` PRIMARY KEY(`match_id`,`slot`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` varchar(36) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`reason` varchar(16) NOT NULL,
	`rounds` int NOT NULL,
	`duration_ticks` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`user_id` varchar(36) NOT NULL,
	`rating` int NOT NULL,
	`games` int NOT NULL DEFAULT 0,
	`wins` int NOT NULL DEFAULT 0,
	`losses` int NOT NULL DEFAULT 0,
	`draws` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ratings_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_match_id_matches_id_fk` FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `match_players` ADD CONSTRAINT `match_players_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ratings` ADD CONSTRAINT `ratings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `match_players_user_id_index` ON `match_players` (`user_id`);--> statement-breakpoint
CREATE INDEX `matches_created_at_index` ON `matches` (`created_at`);