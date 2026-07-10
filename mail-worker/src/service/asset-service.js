import KvConst from '../const/kv-const';
import { isDel } from '../const/entity-const';
import creatorRewardsService from './creator-rewards-service';

const assetService = {
	async overview(c) {
		const domains = this.envDomainList(c.env.domain);
		const now = this.nowSqlTime();
		const { results: domainRows } = await c.env.db.prepare(`
			SELECT
				LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
				COUNT(*) AS total,
				SUM(CASE WHEN is_del = ? THEN 1 ELSE 0 END) AS normal,
				SUM(CASE WHEN is_del = ? THEN 1 ELSE 0 END) AS deleted,
				SUM(CASE WHEN ${this.assetSql()} THEN 1 ELSE 0 END) AS assetMarked,
				SUM(CASE WHEN creator_rewards_status = 'joined' THEN 1 ELSE 0 END) AS creatorJoined,
				SUM(CASE WHEN creator_rewards_status = 'rejected' THEN 1 ELSE 0 END) AS creatorRejected,
				SUM(CASE WHEN creator_rewards_status = 'rejected' AND creator_rewards_retry_at <> '' AND creator_rewards_retry_at <= ? THEN 1 ELSE 0 END) AS creatorRetryReady,
				MAX(last_agent_sync_at) AS lastAgentSyncAt,
				MAX(last_stats_sync_at) AS lastStatsSyncAt,
				MAX(creator_rewards_last_checked_at) AS creatorLastCheckedAt
			FROM account
			GROUP BY domain
			ORDER BY total DESC
		`).bind(isDel.NORMAL, isDel.DELETE, now).all();

		const rows = (domainRows || []).map(row => ({
			...row,
			canReceive: domains.includes(row.domain)
		}));

		const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
		const normal = rows.reduce((sum, row) => sum + Number(row.normal || 0), 0);
		const assetMarked = rows.reduce((sum, row) => sum + Number(row.assetMarked || 0), 0);
		const creatorJoined = rows.reduce((sum, row) => sum + Number(row.creatorJoined || 0), 0);
		const creatorRejected = rows.reduce((sum, row) => sum + Number(row.creatorRejected || 0), 0);
		const creatorRetryReady = rows.reduce((sum, row) => sum + Number(row.creatorRetryReady || 0), 0);
		const receivable = rows
			.filter(row => row.canReceive)
			.reduce((sum, row) => sum + Number(row.normal || 0), 0);

		return {
			total,
			normal,
			assetMarked,
			receivable,
			external: Math.max(0, normal - receivable),
			creatorJoined,
			creatorRejected,
			creatorRetryReady,
			configuredDomains: domains,
			domains: rows
		};
	},

	async list(c, params = {}) {
		let num = Number(params.num || 1);
		let size = Number(params.size || 20);
		if (!Number.isFinite(num) || num < 1) num = 1;
		if (!Number.isFinite(size) || size < 1) size = 20;
		if (size > 100) size = 100;

		const domains = this.envDomainList(c.env.domain);
		const where = ['is_del = ?'];
		const binds = [isDel.NORMAL];
		const domain = this.normalizeDomain(params.domain);
		const keyword = String(params.keyword || params.email || '').trim();
		const configuredOnly = this.truthy(params.configuredOnly);
		const creatorStatus = String(params.creatorStatus || '').trim();
		const now = this.nowSqlTime();

		if (domain) {
			where.push("LOWER(SUBSTR(email, INSTR(email, '@') + 1)) = LOWER(?)");
			binds.push(domain);
		}

		if (configuredOnly && domains.length > 0) {
			where.push(`LOWER(SUBSTR(email, INSTR(email, '@') + 1)) IN (${domains.map(() => '?').join(',')})`);
			binds.push(...domains);
		}

		if (keyword) {
			where.push('(email COLLATE NOCASE LIKE ? OR name COLLATE NOCASE LIKE ? OR tiktok_username COLLATE NOCASE LIKE ? OR bit_browser_id COLLATE NOCASE LIKE ?)');
			binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
		}

		if (this.truthy(params.assetOnly)) {
			where.push(`(${this.assetSql()})`);
		}

		if (creatorStatus === 'joined') {
			where.push("creator_rewards_status = 'joined'");
		} else if (creatorStatus === 'rejected') {
			where.push("creator_rewards_status = 'rejected'");
		} else if (creatorStatus === 'retryReady') {
			where.push("creator_rewards_status = 'rejected' AND creator_rewards_retry_at <> '' AND creator_rewards_retry_at <= ?");
			binds.push(now);
		} else if (creatorStatus === 'unrecognized') {
			where.push("COALESCE(creator_rewards_status, '') = ''");
		}

		const whereSql = `WHERE ${where.join(' AND ')}`;
		const offset = (num - 1) * size;
		const countRow = await c.env.db.prepare(`
			SELECT COUNT(*) AS total
			FROM account
			${whereSql}
		`).bind(...binds).first();

		const { results } = await c.env.db.prepare(`
			SELECT
				account_id AS accountId,
				email,
				LOWER(SUBSTR(email, INSTR(email, '@') + 1)) AS domain,
				name,
				tiktok_username AS tiktokUsername,
				matrix_account_id AS matrixAccountId,
				bit_browser_id AS bitBrowserId,
				tiktok_followers AS tiktokFollowers,
				tiktok_views AS tiktokViews,
				tiktok_views_text AS tiktokViewsText,
				creator_rewards_username AS creatorRewardsUsername,
				creator_rewards_status AS creatorRewardsStatus,
				creator_rewards_joined_at AS creatorRewardsJoinedAt,
				creator_rewards_rejected_at AS creatorRewardsRejectedAt,
				creator_rewards_retry_at AS creatorRewardsRetryAt,
				creator_rewards_last_checked_at AS creatorRewardsLastCheckedAt,
				creator_rewards_email_id AS creatorRewardsEmailId,
				creator_rewards_subject AS creatorRewardsSubject,
				login_status AS loginStatus,
				last_agent_sync_at AS lastAgentSyncAt,
				last_stats_sync_at AS lastStatsSyncAt,
				create_time AS createTime,
				CASE WHEN ${this.assetSql()} THEN 1 ELSE 0 END AS assetMarked
			FROM account
			${whereSql}
			ORDER BY account_id DESC
			LIMIT ? OFFSET ?
		`).bind(...binds, size, offset).all();

		const rows = results || [];
		const tokens = await Promise.all(rows.map(row => c.env.kv.get(KvConst.SUB_ACCOUNT_TOKEN + String(row.email || '').toLowerCase())));
		return {
			list: rows.map((row, index) => ({
			...row,
			canReceive: domains.includes(row.domain),
			hasToken: !!tokens[index],
			creatorRewardsText: this.creatorRewardsText(row)
		})),
			total: countRow?.total || 0
		};
	},

	async scanCreatorRewards(c, params = {}) {
		return creatorRewardsService.scanHistory(c, params);
	},

	assetSql() {
		return `
			COALESCE(matrix_account_id, '') <> ''
			OR COALESCE(bit_browser_id, '') <> ''
			OR COALESCE(tiktok_username, '') <> ''
			OR COALESCE(creator_rewards_status, '') <> ''
			OR COALESCE(creator_rewards_username, '') <> ''
			OR COALESCE(tiktok_followers, 0) > 0
			OR COALESCE(tiktok_views, 0) > 0
			OR COALESCE(tiktok_views_text, '') <> ''
			OR COALESCE(login_status, '') <> ''
			OR COALESCE(last_agent_sync_at, '') <> ''
			OR COALESCE(last_stats_sync_at, '') <> ''
		`;
	},

	envDomainList(domainList) {
		let list = domainList;
		if (typeof list === 'string') {
			try {
				list = JSON.parse(list);
			} catch (e) {
				list = list.split(',');
			}
		}
		if (!Array.isArray(list)) return [];
		return [...new Set(list.map(domain => this.normalizeDomain(domain)).filter(Boolean))];
	},

	normalizeDomain(domain) {
		return String(domain || '').replace(/^@/, '').trim().toLowerCase();
	},

	truthy(value) {
		return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
	},

	nowSqlTime() {
		return new Date().toISOString().slice(0, 19).replace('T', ' ');
	},

	creatorRewardsText(row) {
		if (row.creatorRewardsStatus === 'joined') {
			return row.creatorRewardsJoinedAt ? `已加入 ${row.creatorRewardsJoinedAt}` : '已加入';
		}
		if (row.creatorRewardsStatus === 'rejected') {
			return row.creatorRewardsRetryAt ? `被拒，可重申 ${row.creatorRewardsRetryAt}` : '被拒';
		}
		return '';
	}
};

export default assetService;
