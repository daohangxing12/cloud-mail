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

const codeUtils = {
	extract(row) {
		const savedCode = this.normalizeCode(row?.code);
		if (savedCode) {
			return savedCode;
		}

		const subject = row?.subject || '';
		const text = emailUtils.formatText(row?.text || '');
		const htmlText = emailUtils.htmlToText(row?.content || '');
		const body = [subject, text, htmlText].filter(Boolean).join('\n');

		return this.extractFromText(body);
	},

	extractFromText(value) {
		if (!value) {
			return '';
		}

		const text = String(value).replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, ' ');
		const lowerText = text.toLowerCase();

		for (const keyword of KEYWORDS) {
			let index = lowerText.indexOf(keyword.toLowerCase());

			while (index !== -1) {
				const windowText = text.slice(index, index + 160);
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
		const candidates = [];
		let match;
		const numericRe = /(?:^|[^\d])(\d{4,8})(?!\d)/g;

		while ((match = numericRe.exec(text)) !== null) {
			candidates.push(match[1]);
		}

		const alphaNumRe = /(?:^|[^A-Za-z0-9])([A-Za-z0-9][A-Za-z0-9_-]{3,7})(?![A-Za-z0-9])/g;
		while ((match = alphaNumRe.exec(text)) !== null) {
			const code = this.normalizeCode(match[1]);
			if (code) {
				candidates.push(code);
			}
		}

		return candidates[0] || '';
	},

	normalizeCode(code) {
		if (typeof code !== 'string') {
			return '';
		}

		const value = code.trim().replace(/[\s-]+/g, '');

		if (!/^[A-Za-z0-9]{4,8}$/.test(value)) {
			return '';
		}

		if (!/\d/.test(value)) {
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
