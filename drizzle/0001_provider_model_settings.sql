ALTER TABLE `settings` ADD `providers_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `models_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `active_model_id` text;