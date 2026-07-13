import BizError from '../error/biz-error';
import userContext from '../security/user-context';

const MAX_PROFILE_BYTES = 512 * 1024;
const MAX_WINDOW_BYTES = 256 * 1024;
const MAX_SYNC_BATCH = 100;

let schemaReady = false;

const desktopSyncService = {
	async session(c) {
		const user = userContext.getUser(c);
		return {
			userId: user.userId,
			email: user.email,
			type: Number(user.type || 0),
		};
	},

	async bootstrap(c) {
		await this.ensureSchema(c);
		const userId = userContext.getUserId(c);
		const [profileRow, windowRows] = await Promise.all([
			c.env.db.prepare(`
				SELECT payload_cipher AS payloadCipher, payload_iv AS payloadIv,
				       revision, updated_at AS updatedAt
				FROM desktop_profile
				WHERE user_id = ?
			`).bind(userId).first(),
			c.env.db.prepare(`
				SELECT browser_id AS browserId, payload_cipher AS payloadCipher,
				       payload_iv AS payloadIv, revision, updated_at AS updatedAt
				FROM desktop_window
				WHERE user_id = ? AND is_del = 0
				ORDER BY updated_at ASC, browser_id ASC
				LIMIT 5000
			`).bind(userId).all(),
		]);

		const profile = profileRow
			? await this.decryptPayload(c, profileRow.payloadCipher, profileRow.payloadIv)
			: null;
		const windows = [];
		for (const row of windowRows.results || []) {
			const payload = await this.decryptPayload(c, row.payloadCipher, row.payloadIv);
			if (!payload || typeof payload !== 'object') continue;
			payload.browser_id = String(row.browserId || payload.browser_id || '').trim();
			payload.revision = Number(row.revision || 0);
			payload.updated_at = row.updatedAt || '';
			windows.push(payload);
		}

		return {
			initialized: Boolean(profileRow || windows.length),
			profile: profile || {},
			profileRevision: Number(profileRow?.revision || 0),
			profileUpdatedAt: profileRow?.updatedAt || '',
			windows,
		};
	},

	async saveProfile(c, payload = {}) {
		await this.ensureSchema(c);
		const userId = userContext.getUserId(c);
		const profile = payload.profile && typeof payload.profile === 'object'
			? payload.profile
			: {};
		this.assertPayloadSize(profile, MAX_PROFILE_BYTES, 'profile');
		const encrypted = await this.encryptPayload(c, profile);
		await c.env.db.prepare(`
			INSERT INTO desktop_profile (
				user_id, payload_cipher, payload_iv, revision, updated_at
			) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id) DO UPDATE SET
				payload_cipher = excluded.payload_cipher,
				payload_iv = excluded.payload_iv,
				revision = desktop_profile.revision + 1,
				updated_at = CURRENT_TIMESTAMP
		`).bind(userId, encrypted.cipher, encrypted.iv).run();
		const row = await c.env.db.prepare(`
			SELECT revision, updated_at AS updatedAt
			FROM desktop_profile WHERE user_id = ?
		`).bind(userId).first();
		return {
			revision: Number(row?.revision || 0),
			updatedAt: row?.updatedAt || '',
		};
	},

	async syncWindows(c, payload = {}) {
		await this.ensureSchema(c);
		const userId = userContext.getUserId(c);
		const items = Array.isArray(payload.windows) ? payload.windows : [];
		if (!items.length) {
			return { added: 0, updated: 0, skipped: 0 };
		}
		if (items.length > MAX_SYNC_BATCH) {
			throw new BizError(`windows batch cannot exceed ${MAX_SYNC_BATCH}`, 400);
		}

		let added = 0;
		let updated = 0;
		let skipped = 0;
		for (const item of items) {
			const browserId = String(item?.browser_id || item?.browserId || '').trim();
			if (!browserId || browserId.length > 128) {
				skipped += 1;
				continue;
			}
			this.assertPayloadSize(item, MAX_WINDOW_BYTES, 'window');
			const current = await c.env.db.prepare(`
				SELECT payload_cipher AS payloadCipher, payload_iv AS payloadIv
				FROM desktop_window
				WHERE user_id = ? AND browser_id = ?
			`).bind(userId, browserId).first();
			const oldPayload = current
				? await this.decryptPayload(c, current.payloadCipher, current.payloadIv)
				: {};
			const merged = this.mergeNonEmpty(oldPayload || {}, item || {});
			merged.browser_id = browserId;
			delete merged.revision;
			delete merged.updated_at;
			const encrypted = await this.encryptPayload(c, merged);
			await c.env.db.prepare(`
				INSERT INTO desktop_window (
					user_id, browser_id, payload_cipher, payload_iv,
					revision, is_del, created_at, updated_at
				) VALUES (?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
				ON CONFLICT(user_id, browser_id) DO UPDATE SET
					payload_cipher = excluded.payload_cipher,
					payload_iv = excluded.payload_iv,
					revision = desktop_window.revision + 1,
					is_del = 0,
					updated_at = CURRENT_TIMESTAMP
			`).bind(userId, browserId, encrypted.cipher, encrypted.iv).run();
			if (current) updated += 1;
			else added += 1;
		}
		return { added, updated, skipped };
	},

	async deleteWindows(c, payload = {}) {
		await this.ensureSchema(c);
		const userId = userContext.getUserId(c);
		const browserIds = [...new Set((payload.browserIds || payload.browser_ids || [])
			.map((value) => String(value || '').trim())
			.filter(Boolean))];
		if (!browserIds.length) return { deleted: 0 };
		if (browserIds.length > MAX_SYNC_BATCH) {
			throw new BizError(`browserIds batch cannot exceed ${MAX_SYNC_BATCH}`, 400);
		}
		let deleted = 0;
		for (const browserId of browserIds) {
			const result = await c.env.db.prepare(`
				UPDATE desktop_window
				SET is_del = 1, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
				WHERE user_id = ? AND browser_id = ? AND is_del = 0
			`).bind(userId, browserId).run();
			deleted += Number(result.meta?.changes || 0);
		}
		return { deleted };
	},

	async ensureSchema(c) {
		if (schemaReady) return;
		await c.env.db.batch([
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS desktop_profile (
					user_id INTEGER PRIMARY KEY,
					payload_cipher TEXT NOT NULL DEFAULT '',
					payload_iv TEXT NOT NULL DEFAULT '',
					revision INTEGER NOT NULL DEFAULT 0,
					updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
				)
			`),
			c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS desktop_window (
					user_id INTEGER NOT NULL,
					browser_id TEXT NOT NULL,
					payload_cipher TEXT NOT NULL DEFAULT '',
					payload_iv TEXT NOT NULL DEFAULT '',
					revision INTEGER NOT NULL DEFAULT 0,
					is_del INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (user_id, browser_id)
				)
			`),
			c.env.db.prepare(`
				CREATE INDEX IF NOT EXISTS idx_desktop_window_user_active
				ON desktop_window(user_id, is_del, updated_at)
			`),
		]);
		schemaReady = true;
	},

	mergeNonEmpty(current, incoming) {
		const base = this.isPlainObject(current) ? { ...current } : {};
		if (!this.isPlainObject(incoming)) return base;
		for (const [key, value] of Object.entries(incoming)) {
			if (this.isPlainObject(value)) {
				base[key] = this.mergeNonEmpty(base[key], value);
				continue;
			}
			if (Array.isArray(value)) {
				if (value.length) base[key] = value;
				continue;
			}
			if (this.isMeaningful(value)) base[key] = value;
		}
		return base;
	},

	isPlainObject(value) {
		return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
	},

	isMeaningful(value) {
		if (value === false || value === 0) return true;
		if (value === null || value === undefined) return false;
		const text = String(value).trim();
		return !['', '-', '--', '---', 'none', 'null', 'unknown', 'n/a'].includes(text.toLowerCase());
	},

	assertPayloadSize(payload, maxBytes, label) {
		const size = new TextEncoder().encode(JSON.stringify(payload || {})).length;
		if (size > maxBytes) {
			throw new BizError(`${label} payload is too large`, 413);
		}
	},

	async encryptionKey(c) {
		const secret = String(c.env.DESKTOP_SYNC_SECRET || c.env.desktop_sync_secret || c.env.jwt_secret || '');
		if (!secret) throw new BizError('desktop sync encryption secret is not configured', 500);
		const material = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(`ntmcn-desktop-sync:${secret}`),
		);
		return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
	},

	async encryptPayload(c, payload) {
		const key = await this.encryptionKey(c);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const plain = new TextEncoder().encode(JSON.stringify(payload || {}));
		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
		return {
			cipher: this.toBase64(new Uint8Array(encrypted)),
			iv: this.toBase64(iv),
		};
	},

	async decryptPayload(c, cipherText, ivText) {
		if (!cipherText || !ivText) return {};
		try {
			const key = await this.encryptionKey(c);
			const plain = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: this.fromBase64(ivText) },
				key,
				this.fromBase64(cipherText),
			);
			return JSON.parse(new TextDecoder().decode(plain));
		} catch (error) {
			throw new BizError(`desktop sync data cannot be decrypted: ${error.message}`, 500);
		}
	},

	toBase64(bytes) {
		let binary = '';
		const chunkSize = 0x8000;
		for (let index = 0; index < bytes.length; index += chunkSize) {
			binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
		}
		return btoa(binary);
	},

	fromBase64(text) {
		const binary = atob(String(text || ''));
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	},
};

export default desktopSyncService;
