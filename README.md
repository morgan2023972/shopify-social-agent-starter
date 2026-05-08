# Shopify Social Agent

AI agent for a Node.js + TypeScript CLI workflow that reads X posts, scores relevance, generates reply variants, and publishes only approved comments.

## Features

- Read recent posts from configured X accounts
- Score posts based on Shopify/dev relevance
- Generate AI comment variants for review
- Manage a local moderation queue (`pending -> approved -> published`)
- Publish approved replies with `DRY_RUN=true` by default
- Multilingual support with `languageMode` and `reviewLanguage`

## Installation

```bash
npm install
cp .env.example .env
```

## Environment Setup

Create and configure `.env` with the values required for your workflow.

Required for reading + AI generation (daily queue workflow):

- `OPENAI_API_KEY` (comment generation)
- `X_BEARER_TOKEN` (read-only access to public X posts)

Optional runtime values:

- `DRY_RUN=true` (default and recommended)
- `MAX_COMMENTS_PER_DAY=5`
- `MIN_SCORE_TO_QUEUE=70`

Required only for real publishing (`DRY_RUN=false`):

- `X_APP_KEY`
- `X_APP_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_SECRET`

X write credentials are not required for testing, queue generation, listing, or approval when `DRY_RUN=true`.

## Configure Targets

Edit `data/targets.json`.

Multilingual target fields:

- `languageMode`
  - `match-post`: publish in detected source post language
  - `target-review-language`: publish in `reviewLanguage`
- `reviewLanguage`: reviewer language (`fr` or `en`)

Example:

```json
{
  "id": "shopifydevs",
  "platform": "x",
  "handle": "ShopifyDevs",
  "priority": 1,
  "angle": "Shopify dev tools, Liquid, themes, Hydrogen",
  "languageMode": "match-post",
  "reviewLanguage": "fr"
}
```

## Queue Format (Current)

Queue items now store structured variants:

```json
{
  "postLanguage": "en",
  "publishLanguage": "en",
  "variants": [
    {
      "text": "Published reply",
      "reviewText": "Reviewer-facing wording",
      "postLanguage": "en",
      "publishLanguage": "en"
    }
  ]
}
```

- `text`: publishable reply content. This is the candidate used to set `selectedText`.
- `reviewText`: reviewer-facing wording for internal moderation only, never published.

Only `selectedText` is sent to the platform during publishing.

## Usage

Generate daily queue:

```bash
npm run daily
```

List queue:

```bash
npm run queue:list
```

Approve a queue item:

```bash
npm run queue:approve -- <QUEUE_ITEM_ID> [variantIndex]
```

Publish approved items:

```bash
npm run publish
```

With the default `DRY_RUN=true`, this command does not publish on X. It only logs what would be published.

Real publishing (disable dry run):

Warning: this enables live posting on X. Use it only after review and only when X write credentials are configured (`X_APP_KEY`, `X_APP_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`).

```bash
DRY_RUN=false npm run publish
```

## Security

- Never commit `.env`, API keys, or access tokens
- Keep credentials only in environment variables
- Rotate keys immediately if exposed
- Keep `DRY_RUN=true` in non-production workflows

## Roadmap

- Local dashboard UI for queue moderation
- Advanced multilingual generation/review controls
- Scheduled automation and reporting
