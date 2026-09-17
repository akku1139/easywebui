CREATE TABLE `api_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`date` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`messages_json` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT 'gpt-4o' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`last_checked` integer,
	`created_at` integer NOT NULL,
	`oauth_enabled` integer DEFAULT false NOT NULL,
	`oauth_client_id` text,
	`oauth_client_secret` text,
	`oauth_token_endpoint` text,
	`oauth_auth_endpoint` text,
	`oauth_registration_endpoint` text,
	`oauth_access_token` text,
	`oauth_refresh_token` text,
	`oauth_token_expires_at` integer,
	`oauth_scopes` text
);
--> statement-breakpoint
CREATE TABLE `memory_extraction_log` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`facts_extracted` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`state` text NOT NULL,
	`code_verifier` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device` text,
	`browser` text,
	`timezone` text,
	`language` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoints_json` text DEFAULT '[]' NOT NULL,
	`active_endpoint_id` text,
	`memory_enabled` integer DEFAULT true NOT NULL,
	`auto_memory` integer DEFAULT true NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`custom_system_prompt` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`source` text DEFAULT 'explicit' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
