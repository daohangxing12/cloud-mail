const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
	const list = Array.from(bytes || [], byte => String.fromCharCode(byte));
	return btoa(list.join(''));
}

function fromBase64(text) {
	const raw = atob(String(text || ''));
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

async function deriveKey(secret) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(secret || '')));
	return crypto.subtle.importKey('raw', digest, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret, value) {
	const text = String(value || '');
	if (!text) {
		return '';
	}
	const keySeed = String(secret || '').trim();
	if (!keySeed) {
		return text;
	}
	const key = await deriveKey(keySeed);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{name: 'AES-GCM', iv},
		key,
		encoder.encode(text)
	);
	return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(secret, value) {
	const text = String(value || '');
	if (!text) {
		return '';
	}
	if (!text.startsWith('v1:')) {
		return text;
	}
	const keySeed = String(secret || '').trim();
	if (!keySeed) {
		return text;
	}
	const parts = text.split(':');
	if (parts.length !== 3) {
		return text;
	}
	try {
		const key = await deriveKey(keySeed);
		const iv = fromBase64(parts[1]);
		const encrypted = fromBase64(parts[2]);
		const decrypted = await crypto.subtle.decrypt(
			{name: 'AES-GCM', iv},
			key,
			encrypted
		);
		return decoder.decode(decrypted);
	} catch (err) {
		return text;
	}
}
