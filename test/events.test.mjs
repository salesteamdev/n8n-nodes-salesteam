// The trigger's event list: complete, in n8n's alphabetical order, and the same
// as Salesteam's event catalog when the Salesteam app sits next to this package
// (integrations/n8n in the Salesteam code) or SALESTEAM_PLATFORM_DIR points at its
// platform folder.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SALESTEAM_EVENTS, TEST_EVENT_OPTIONS } from '../nodes/SalesteamTrigger/events.ts';

const here = dirname(fileURLToPath(import.meta.url));
const platform = process.env.SALESTEAM_PLATFORM_DIR
	? resolve(process.env.SALESTEAM_PLATFORM_DIR)
	: resolve(here, '../../../platform');
const catalogFile = join(platform, 'lib/integrations.ts');

const names = (options) => options.map((option) => option.name);
const singleSentence = (text) => text.split('. ').length === 1;
// Salesteam's wording as n8n's linter wants it: no final period on a single sentence.
const n8nStyle = (text) => (singleSentence(text) ? text.replace(/\.$/, '') : text);
// Reworded because the linter wants "URL" in capitals, and the catalog names the post.url field.
const REWORDED = new Set(['post.liked']);

test('19 events, each once, described the way n8n’s linter checks', () => {
	assert.equal(SALESTEAM_EVENTS.length, 19);
	assert.equal(new Set(SALESTEAM_EVENTS.map((event) => event.value)).size, 19);
	for (const event of [...SALESTEAM_EVENTS, ...TEST_EVENT_OPTIONS]) {
		assert.ok(event.description, `${event.value} has a description`);
		assert.equal(
			singleSentence(event.description),
			!event.description.endsWith('.'),
			`${event.value}: final period`,
		);
		assert.doesNotMatch(
			event.description,
			/\b(u|U)rl(s?)\b|\b(i|I)d(s?)\b/,
			`${event.value}: URL and ID in capitals`,
		);
	}
	for (const event of SALESTEAM_EVENTS) assert.match(event.name, /^[A-Z]\S*( [A-Za-z,]+)*$/, `${event.value}: a Title Case name`);
});

test('names are in alphabetical order, so the list reads group by group', () => {
	for (const options of [SALESTEAM_EVENTS, TEST_EVENT_OPTIONS]) {
		assert.deepEqual(names(options), [...names(options)].sort());
		assert.deepEqual(
			names(options),
			[...names(options)].sort((a, b) => a.localeCompare(b)),
		);
	}
});

test('the test event list adds test.ping', () => {
	assert.deepEqual(
		TEST_EVENT_OPTIONS.map((event) => event.value).sort(),
		[...SALESTEAM_EVENTS.map((event) => event.value), 'test.ping'].sort(),
	);
});

test(
	'matches Salesteam’s event catalog',
	{
		skip:
			!existsSync(catalogFile) &&
			`no Salesteam catalog at ${catalogFile} (set SALESTEAM_PLATFORM_DIR)`,
	},
	async () => {
		const catalog = await import(pathToFileURL(catalogFile).href);
		// The events Salesteam offers: its groups, without the older hidden ones.
		assert.deepEqual(
			[...SALESTEAM_EVENTS.map((event) => event.value)].sort(),
			catalog.INTEGRATION_EVENT_GROUPS.flatMap((group) => group.events).sort(),
		);
		for (const event of SALESTEAM_EVENTS) {
			assert.ok(
				catalog.INTEGRATION_EVENT_GROUPS.some((item) => item.events.includes(event.value)),
				`${event.value} is in a group`,
			);
			// The app's own words, in Title Case; they match HeyReach's where Salesteam has the same event.
			assert.equal(event.name.toLowerCase(), catalog.integrationEventLabels[event.value].toLowerCase());
			const description = catalog.integrationEventDescriptions[event.value];
			if (REWORDED.has(event.value))
				assert.equal(event.description.split('. ')[0], description.split('. ')[0]);
			else assert.equal(event.description, n8nStyle(description));
		}
	},
);
