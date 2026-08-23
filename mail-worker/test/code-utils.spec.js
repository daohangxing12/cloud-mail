import { describe, expect, it } from 'vitest';
import codeUtils from '../src/utils/code-utils';

describe('codeUtils', () => {
	it('prefers the contextual TikTok code over an incorrect saved code', () => {
		expect(codeUtils.extract({
			subject: '106707 is your 6-digit code',
			text: 'Hi zhxg804081,\n\nYour 6-digit code is: 106707',
			content: '',
			code: '804081'
		})).toBe('106707');
	});

	it('does not extract digits embedded in a username', () => {
		expect(codeUtils.extractFromText('Hi zhxg804081, welcome back.')).toBe('');
		expect(codeUtils.extractFromText('Account abc123456 has no verification code.')).toBe('');
	});

	it('supports codes before and after an explicit code label', () => {
		expect(codeUtils.extractFromText('106707 is your 6-digit code')).toBe('106707');
		expect(codeUtils.extractFromText('Your 6-digit code is: 106707')).toBe('106707');
	});

	it('rejects ambiguous unlabelled candidates', () => {
		expect(codeUtils.extractFromText('Values 106707 and 804081')).toBe('');
	});

	it('uses a valid saved code only when the message has no extractable code', () => {
		expect(codeUtils.extract({ subject: '', text: '', content: '', code: '654321' })).toBe('654321');
	});
});
