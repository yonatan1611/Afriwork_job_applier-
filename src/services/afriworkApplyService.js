import {
	AFRIWORK_APPLY_ENABLED,
	AFRIWORK_LOGIN_URL,
	AFRIWORK_JOB_URL_TEMPLATE,
	AFRIWORK_EMAIL,
	AFRIWORK_PASSWORD,
	AFRIWORK_CV_PATH,
	AFRIWORK_HEADLESS,
	AFRIWORK_SELECTOR_EMAIL,
	AFRIWORK_SELECTOR_PASSWORD,
	AFRIWORK_SELECTOR_LOGIN_SUBMIT,
	AFRIWORK_SELECTOR_APPLY_BUTTON,
	AFRIWORK_SELECTOR_FILE_INPUT,
	AFRIWORK_SELECTOR_COVER_LETTER,
	AFRIWORK_SELECTOR_SUBMIT_APPLICATION,
} from '../config/constants.js';
import fs from 'node:fs';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jobUrl = (id) => AFRIWORK_JOB_URL_TEMPLATE.replace('{id}', id);

export async function applyOnAfriwork({ jobId, coverLetter }) {
	if (!AFRIWORK_APPLY_ENABLED) {
		throw new Error('Auto-apply disabled. Set AFRIWORK_APPLY_ENABLED=true to enable.');
	}
	if (!AFRIWORK_EMAIL || !AFRIWORK_PASSWORD) {
		throw new Error('Missing AFRIWORK_EMAIL/AFRIWORK_PASSWORD.');
	}
	const cvPath = path.resolve(AFRIWORK_CV_PATH);
	if (!fs.existsSync(cvPath)) {
		throw new Error('CV file not found at ' + cvPath);
	}

	// Lazy import Playwright only when needed
	const { chromium } = await import('playwright');

	const browser = await chromium.launch({ headless: AFRIWORK_HEADLESS });
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Login
		await page.goto(AFRIWORK_LOGIN_URL, { waitUntil: 'domcontentloaded' });
		await page.waitForSelector(AFRIWORK_SELECTOR_EMAIL, { timeout: 20000 });
		await page.fill(AFRIWORK_SELECTOR_EMAIL, AFRIWORK_EMAIL);
		await page.fill(AFRIWORK_SELECTOR_PASSWORD, AFRIWORK_PASSWORD);
		await page.click(AFRIWORK_SELECTOR_LOGIN_SUBMIT);
		await page.waitForLoadState('networkidle', { timeout: 30000 });

		// Open job page
		const url = jobUrl(jobId);
		await page.goto(url, { waitUntil: 'domcontentloaded' });

		// Click apply (try multiple strategies)
		try {
			await page.waitForSelector(AFRIWORK_SELECTOR_APPLY_BUTTON, { timeout: 20000 });
			await page.click(AFRIWORK_SELECTOR_APPLY_BUTTON);
		} catch {
			await page.getByText('Apply', { exact: false }).first().click();
		}

		// Upload CV
		await page.waitForSelector(AFRIWORK_SELECTOR_FILE_INPUT, { timeout: 20000 });
		const input = await page.$(AFRIWORK_SELECTOR_FILE_INPUT);
		if (!input) throw new Error('File input not found');
		await input.setInputFiles(cvPath);

		// Fill cover letter
		const cl = (coverLetter || '').trim();
		if (cl) {
			const selector = AFRIWORK_SELECTOR_COVER_LETTER;
			await page.waitForSelector(selector, { timeout: 20000 });
			const el = await page.$(selector);
			if (!el) throw new Error('Cover letter field not found');
			const tagName = await el.evaluate((node) => node.tagName?.toLowerCase?.() || '');
			if (tagName === 'textarea' || tagName === 'input') {
				await el.fill(cl);
			} else {
				await el.evaluate((node, text) => { node.innerText = text; }, cl);
			}
		}

		// Submit application
		try {
			await page.waitForSelector(AFRIWORK_SELECTOR_SUBMIT_APPLICATION, { timeout: 20000 });
			await page.click(AFRIWORK_SELECTOR_SUBMIT_APPLICATION);
		} catch {
			await page.getByText('Submit', { exact: false }).first().click();
		}

		await sleep(2000);
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err?.message || String(err) };
	} finally {
		await page.close().catch(() => {});
		await context.close().catch(() => {});
		await browser.close().catch(() => {});
	}
}

