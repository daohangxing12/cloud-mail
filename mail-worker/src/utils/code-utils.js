import emailUtils from './email-utils';

const KEYWORDS = [
	'code',
	'verification',
	'verify',
	'otp',
	'passcode',
	'security',
	'\u9a8c\u8bc1\u7801',
	'\u6821\u9a8c\u7801',
	'\u52a8\u6001\u7801',
	'\u5b89\u5168\u7801',
	'\u767b\u5f55\u7801'
];

const CONTEXT_PATTERNS = [
	/(?:^|[^A-Za-z0-9])(\d{6})(?![A-Za-z0-9])\s*(?:is\s+)?(?:your\s+)?(?:6[\s-]*digit\s+)?(?:verification\s+)?(?:code|otp|passcode)\b/i,
	/\b(?:your\s+)?(?:6[\s-]*digit\s+)?(?:verification\s+)?(?:code|otp|passcode)\s*(?:is\s*)?(?::|\uff1a|-)?\s*(?:^|[^A-Za-z0-9])(\d{6})(?![A-Za-z0-9])/i,
	/(?:\u9a8c\u8bc1\u7801|\u6821\u9a8c\u7801|\u52a8\u6001\u7801|\u5b89\u5168\u7801|\u767b\u5f55\u7801)\s*(?:\u662f\s*)?(?::|\uff1a|-)?\s*(?:^|[^A-Za-z0-9])(\d{6})(?![A-Za-z0-9])/i
];

const codeUtils = {
	extract(row) {
		const subject = row?.subject || '';
		const text = emailUtils.formatText(row?.text || '');
		const htmlText = emailUtils.htmlToText(row?.content || '');
		const body = [subject, text, htmlText].filter(Boolean).join('\n');
		const contentCode = this.extractFromText(body);
		if (contentCode) {
			return contentCode;
		}

		return this.normalizeCode(row?.code);
	},

	extractFromText(value) {
		if (!value) {
			return '';
		}

		const text = String(value).replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, ' ');
		const lowerText = text.toLowerCase();

		for (const pattern of CONTEXT_PATTERNS) {
			const match = text.match(pattern);
			const code = this.normalizeCode(match?.[1]);
			if (code) {
				return code;
			}
		}

		for (const keyword of KEYWORDS) {
			let index = lowerText.indexOf(keyword.toLowerCase());

			while (index !== -1) {
				const windowText = text.slice(Math.max(0, index - 80), index + 160);
				const code = this.findCandidate(windowText);
				if (code) {
					return code;
				}
				index = lowerText.indexOf(keyword.toLowerCase(), index + keyword.length);
			}
		}

		return this.findCandidate(text);
	},

	findCandidate(text) {
		const candidates = new Set();
		let match;
		const numericRe = /(?:^|[^A-Za-z0-9])(\d{6})(?![A-Za-z0-9])/g;

		while ((match = numericRe.exec(text)) !== null) {
			const code = this.normalizeCode(match[1]);
			if (code) {
				candidates.add(code);
			}
		}

		return candidates.size === 1 ? [...candidates][0] : '';
	},

	normalizeCode(code) {
		if (typeof code !== 'string') {
			return '';
		}

		const value = code.trim().replace(/[\s-]+/g, '');

		if (!/^\d{6}$/.test(value)) {
			return '';
		}

		return value;
	},

	toSnippet(row) {
		const text = emailUtils.formatText(row?.text || '') || emailUtils.htmlToText(row?.content || '');
		return text.slice(0, 500);
	}
};

export default codeUtils;
