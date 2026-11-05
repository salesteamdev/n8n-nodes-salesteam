# n8n-nodes-salesteam

Salesteam for [n8n](https://n8n.io). Salesteam runs LinkedIn outreach: campaigns, InMail, replies in one inbox.

This package adds two nodes and one credential:

- **Salesteam**: add leads to campaigns and lists, stop, pause or resume them, tag them, find them, and read conversations. AI agents can use it as a tool too (**Salesteam Tool**).
- **Salesteam Trigger**: start a workflow when something happens in Salesteam, like a reply or a booked meeting. It signs up for the events itself and checks that every request really comes from Salesteam.
- **Salesteam API** credential: your workspace API key.

Nothing in these nodes sends a LinkedIn message by itself. People you add join their campaign, and Salesteam contacts them within each account's limits, hours and safety checks.

> Tested 2026-11-05 inside n8n 2.45.4 against the real Salesteam API (21 checks): the credential test, every dropdown, every operation, and the trigger. Turning the workflow on adds its Salesteam webhook, real signed events run it, a forged one gets 401 and never runs, and turning it off removes the webhook. `npm run lint` (n8n's linter, with its n8n Cloud rules) passes.

## Install (self-hosted n8n)

1. In n8n, open **Settings → Community nodes** and click **Install**.
2. Enter `n8n-nodes-salesteam`.
3. Tick the box that says you understand the risks of installing unverified code, then click **Install**.

Only an n8n owner or admin can install community nodes. On n8n Cloud the nodes show up once n8n verifies the package (see [Get verified](#get-verified-for-n8n-cloud)).

## Credentials

1. In Salesteam, open **Settings → API keys** and click **Create API key** (or click **Create API key** in the n8n window under **Settings → Integrations**). Copy it: Salesteam shows it once. It starts with `st_live_`.
2. In n8n, add a **Salesteam API** credential and paste the key.

n8n checks the key with `GET /me`. Each key belongs to one workspace and can make 300 requests a minute. Revoking a key in Salesteam also removes the webhooks it added.

## Salesteam Trigger

Pick the **Events** that start the workflow; a new trigger starts with Salesteam's recommended set (Connection Request Accepted, First Message Reply Received, First InMail Reply Received). You can limit them to some **Campaigns**; LinkedIn account alerts always come through.

| Group | Events |
|---|---|
| Standard | Connection Request Sent, Connection Request Accepted, Message Sent, First Message Reply Received, First InMail Reply Received, Every Message Reply Received, Every InMail Reply Received, InMail Sent, Follow Sent, Liked Post, Viewed Profile, Campaign Completed, Lead Tag Updated, Lead Auto Tagged Positive, Lead Auto Tagged Negative, Lead Auto Tagged Generic |
| Extras | Sequence Finished, LinkedIn Account Disconnected, Requests Paused for Low Acceptance |

n8n lists them alphabetically.

How it works:

- **Turning the workflow on** adds a webhook in Salesteam, named after the workflow (`n8n · Replies to Slack`). Turning it off removes it. Changing the events or campaigns replaces it.
- **Every request is checked.** Salesteam signs each event with the webhook's secret. The trigger checks the signature against the raw body and refuses requests signed more than 5 minutes away from now. Anything that fails gets a `401` and never starts the workflow.
- **Each event starts one run** with Salesteam's event as the data: `type`, `lead`, `campaign`, `sender`, `message`, `conversation` and `link`. The event `id` is the same on retries, so use it to skip repeats.
- **Testing:** click **Listen for test event**, then send a sample from a second tab with the Salesteam node (**Webhook → Send Test Event**, webhook `n8n test · …`). A **Test Ping** only shows while the editor listens; an active workflow doesn't run on it.

Good to know:

- Salesteam sends events only to a **public https address**. n8n Cloud is fine. On self-hosted n8n, set n8n's public address (`N8N_WEBHOOK_URL`, or `WEBHOOK_URL` in older n8n), or use a tunnel. `http://localhost` won't work.
- Keep the n8n server's clock right. A clock more than 5 minutes off makes every event fail the check.
- **No signing secret saved?** This only happens if n8n lost the workflow's saved data. The trigger then refuses every request, because it can't tell real events from fake ones. The next time the workflow is turned on, or n8n restarts, it notices, removes the old webhook and adds a new one with a new secret. To fix it right away, turn the workflow off and on.
- A workspace can have 50 destinations in total. Each active trigger uses one.

## Salesteam node

| Resource | Operations |
|---|---|
| Campaign | Add Lead, Get, Get Many, Stop Lead, Pause Lead, Resume Lead |
| List | Add Lead, Get Many |
| Lead | Get, Find (by LinkedIn URL or email), Add Tags, Remove Tags |
| Conversation | Get (with messages), Get Many (filter by campaign, lead, updated since) |
| Webhook | Send Test Event |

- **Add Lead** sends one person per input item. The output says what happened: `added`, `updated` or `skipped`, with the reason, and for campaigns whether they are in it now (`enrolled`) or when they will join (`note`). Adding someone twice never adds them twice.
- **Stop, Pause, Resume and tags** find the person by LinkedIn URL, email or lead ID. If two people share an email, Salesteam asks for the LinkedIn URL instead.
- **Get Many** has Return All and Limit. Conversations come in pages, newest first; the node follows them.
- **Errors** show Salesteam's own message, with its error code and request ID. Turn on **Continue On Fail** to get errors as items instead.
- When Salesteam is busy or a key hits its rate limit, the node waits as Salesteam asks (up to 30 seconds) and tries again, at most twice. Every change carries an `Idempotency-Key`, so a retry never runs twice.

## Releases

Every version is published to npm by this repository's GitHub Action (`.github/workflows/publish.yml`), with a provenance statement: never from a laptop. n8n only verifies versions published that way (since May 1, 2026).

To release: on `main`, with everything committed and pushed, run `npm run release`. It lints, builds, asks for the new version, updates the changelog, commits, tags and pushes. The tag starts the Action, which tests, builds and publishes.

npm trusts the Action through trusted publishing (the package's **Settings → Trusted Publisher → GitHub Actions**: this repository and `publish.yml`), so no npm token is stored anywhere. The very first version went out with a short-lived token, because npm can only trust a workflow for a package that already exists.

## Get verified for n8n Cloud

Verified nodes show up in n8n Cloud's node panel. Steps from n8n's docs:

1. **Use n8n's tooling.** This package uses the `n8n-node` CLI (`@n8n/node-cli` 0.23.0 or later): `npm run lint`, `npm run build`, `npm run dev`, `npm run release`. It has no runtime dependencies, doesn't touch environment variables or files, is MIT licensed and in English, as n8n requires.
2. **Public GitHub repository**, the one in `package.json` (`repository.url`). npm checks that the provenance statement matches it.
3. **Published by GitHub Actions with provenance** (see [Releases](#releases)).
4. **Run n8n's scanner:** `npx @n8n/scan-community-package n8n-nodes-salesteam`. It must pass.
5. **Submit** the package in the n8n Creator Portal: https://creators.n8n.io/nodes
6. **Wait for review.** It can take up to 4 weeks. n8n emails you as it moves along.

## Development

```bash
npm install          # build tools; npm also installs n8n-workflow, the peer dependency
npm run build        # dist/
npm run lint         # n8n's linter, including its n8n Cloud rules
npm test             # signature check, events, webhook lifecycle (the last needs a build)
npm run typecheck    # TypeScript against n8n-workflow, which npm install brings in
npm run dev          # n8n with these nodes loaded (Docker or Podman from n8n 3.0)
```

`ignore` is a dev dependency only so `npm ci` accepts the lock file: a package that `@n8n/node-cli` uses lists `ignore` 7 as an optional peer, while ESLint needs `ignore` 5.

`test/events.test.mjs` also compares the event list with Salesteam's own event catalog when Salesteam's code sits next to this package, or when `SALESTEAM_PLATFORM_DIR` points at it. When Salesteam adds an event, add it to `nodes/SalesteamTrigger/events.ts`.

The nodes call Salesteam's API v1 at `https://app.salesteam.dev/api/v1`. Its reference is at `/docs` in the Salesteam app (signed in).

## License

[MIT](LICENSE)
