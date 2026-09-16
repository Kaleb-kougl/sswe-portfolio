# Contact form delivery

The contact form posts to `POST /api/contact` (`src/app/api/contact/route.ts`). Validation, the honeypot and the no-JS HTML reply are all in place; the only thing that needs configuring is where a message actually goes.

Delivery is **Formspree** — a plain `fetch`, no SDK, no new dependency, and no DNS. Resend was the alternative, but it requires verifying a domain you own, and this site has none yet (see "When you get a real domain" below).

## Setup

**1. Create the form.** Sign in at [formspree.io](https://formspree.io), create a form, and point it at the address you want notifications delivered to. Formspree will ask you to confirm that address once.

**2. Copy the endpoint.** It looks like `https://formspree.io/f/abcdwxyz`. Either the full URL or the bare id (`abcdwxyz`) works — `resolveEndpoint()` accepts both, because the dashboard shows both and it's genuinely ambiguous which to paste.

**3. Set it on Vercel.** Project → Settings → Environment Variables:

| | |
|---|---|
| Name | `CONTACT_DELIVERY_KEY` |
| Value | `https://formspree.io/f/abcdwxyz` |
| Environments | **Production**. Leave **Preview** unticked unless you want every PR preview mailing you — without it, previews keep returning the honest 503. |

**4. Redeploy.** Vercel injects environment variables at deploy time, so an existing deployment will not pick up a new one. Deployments → ⋯ → Redeploy, or push a commit.

**5. Locally.** Put it in `.env.local` (already covered by `.gitignore`'s `.env*`), or run `vercel env pull .env.local`.

**6. Confirm.** Submit the form on production. You should get the mail, and replying to it should reach the sender — Formspree treats the `email` field as the reply-to.

## What each response means

| Code | HTTP | Meaning |
|---|---|---|
| `sent` | 200 | Formspree accepted it. The only path that claims success. |
| `not_configured` | 503 | No `CONTACT_DELIVERY_KEY`, or it isn't a Formspree endpoint. |
| `delivery_failed` | 502 | Formspree rejected it or the request failed. The provider's own message is logged server-side; the visitor gets a safe one plus the direct email address. |
| `invalid` | 400 | Failed field validation. |
| `rejected` | 400 | Honeypot was filled. |

**The rule the code enforces: nothing ever reports `sent` unless the provider accepted it.** A contact form that swallows mail is worse than no contact form, because the sender stops looking for you. If you change the delivery function, keep that property.

A non-Formspree URL in the env var is treated as *unconfigured* rather than posted to — an env var typo should not become an outbound request to someone else's server.

## Testing without sending real mail

`deliverContactMessage` only depends on `fetch` and `process.env`, so the branches can be exercised by stubbing both. There is no local-endpoint escape hatch on purpose: `resolveEndpoint()` only accepts `formspree.io`, so pointing it at `localhost` will (correctly) read as unconfigured.

Verified behaviour:

```
no key                          503  not_configured
non-formspree url               503  not_configured   (no outbound request made)
garbage key                     503  not_configured
bare form id                    200  sent             -> https://formspree.io/f/<id>
provider 404 (form not found)   502  delivery_failed
provider 422 (monthly limit)    502  delivery_failed
network throw / timeout         502  delivery_failed
honeypot filled                 400  rejected
bad email / empty message       400  invalid
```

`e2e/contact-form.spec.ts` covers the 503 and honeypot paths against the real handler; those run in CI, where no key is set.

## Limits

Formspree's free tier is **50 submissions per month**. Past that it starts rejecting, which surfaces as `delivery_failed` — the visitor is told it didn't send and given the direct address, so nothing is silently lost, but you won't get the message. Their dashboard shows usage.

## When you get a real domain

Two things become worth doing:

1. **Update `src/data/site.ts`.** `SITE_URL` is the single source for `metadataBase` and the JSON-LD `url`. It currently points at the Vercel deployment because `kalebkougl.dev` is not registered — `dig` returns `NXDOMAIN` — which previously meant the OG image resolved to a dead host and link previews had no image.
2. **Consider moving to Resend**, so mail comes from your own domain rather than Formspree's infrastructure. That needs `npm i resend` and DNS on a **subdomain** (`send.yourdomain.com`, keeping the root's `MX` free for real mail):
   - `TXT` at `resend._domainkey.send` — the DKIM public key, which is what proves ownership
   - `TXT` at `send` — SPF, roughly `v=spf1 include:amazonses.com ~all`
   - `MX` at `send` → `feedback-smtp.<region>.amazonses.com`, for bounces
   - optionally `TXT` at `_dmarc` — start at `p=none`

   Copy the exact values from the Resend dashboard; the DKIM key is unique to you and the SES region hostname varies. If the domain's nameservers are Vercel's (`ns1/ns2.vercel-dns.com`) add them in Vercel → Domains, otherwise at your registrar. On Cloudflare, leave these records unproxied.

   Only `deliverContactMessage` would change; everything around it already speaks `sent` / `delivery_failed` / `not_configured`.
