import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const account = sqliteTable('account', {
	accountId: integer('account_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	name: text('name').notNull().default(''),
	windowName: text('window_name').notNull().default(''),
	tiktokUsername: text('tiktok_username').notNull().default(''),
	creatorRewardsUsername: text('creator_rewards_username').notNull().default(''),
	creatorRewardsStatus: text('creator_rewards_status').notNull().default(''),
	creatorRewardsJoinedAt: text('creator_rewards_joined_at').notNull().default(''),
	creatorRewardsRejectedAt: text('creator_rewards_rejected_at').notNull().default(''),
	creatorRewardsRetryAt: text('creator_rewards_retry_at').notNull().default(''),
	creatorRewardsLastCheckedAt: text('creator_rewards_last_checked_at').notNull().default(''),
	creatorRewardsEmailId: integer('creator_rewards_email_id').notNull().default(0),
	creatorRewardsSubject: text('creator_rewards_subject').notNull().default(''),
	status: integer('status').default(0).notNull(),
	latestEmailTime: text('latest_email_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	userId: integer('user_id').notNull(),
	allReceive: integer('all_receive').default(0).notNull(),
	sort: integer('sort').default(0).notNull(),
	isDel: integer('is_del').default(0).notNull(),
});
export default account
