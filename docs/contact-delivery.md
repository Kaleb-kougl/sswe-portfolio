# Contact form delivery

The contact form posts to `POST /api/contact` (`src/app/api/contact/route.ts`). Validation, the honeypot and the no-JS HTML reply are all in place; the only thing that needs configuring is where a message actually goes.

The form also carries a **reCAPTCHA v3** token, because the Formspree form has reCAPTCHA switched on — see [reCAPTCHA](#recaptcha) below. Without one, Formspree rejects everything with `400 {"error":"Please complete the reCAPTCHA"}`.

Delivery is **Formspree** — a plain `fetch`, no SDK, no new dependency, and no DNS. Resend was the alternative, but it requires verifying a domain you own, and this site has none yet (see "When you get a real domain" below).

## Setup

**1. Create the form.** Sign in at [formspree.io](https://formspree.io), create a form, and point it at the address you want notifications delivered to. Formspree will ask you to confirm that address once.

**2. Copy the endpoint.** It looks like `https://formspree.io/f/abcdwxyz`. Either the full URL or the bare id (`abcdwxyz`) works — `resolveEndpoint()` accepts both, because the dashboard shows both and it's genuinely ambiguous which to paste.

> The real id is deliberately **not** in this repo. Formspree's own guides embed it in client-side HTML or JS, where scrapers harvest it and spam it directly. Because this site posts from the server, the id never reaches the browser — so keep it in the environment and out of version control, and that advantage holds.

**3. Set it on Vercel.** Project → Settings → Environment Variables:

| | |
|---|---|
| Name | `CONTACT_DELIVERY_KEY` |
| Value | `https://formspree.io/f/abcdwxyz` |
| Environments | **Production**. Leave **Preview** unticked unless you want every PR preview mailing you — without it, previews keep returning the honest 503. |

**4. Redeploy.** Vercel injects environment variables at deploy time, so an existing deployment will not pick up a new one. Deployments → ⋯ → Redeploy, or push a commit.

**5. Locally.** Put it in `.env.local` (already covered by `.gitignore`'s `.env*`), or run `vercel env pull .env.local`.

**6. Confirm.** Submit the form on production. You should get the mail, and replying to it should reach the sender — Formspree treats the `email` field as the reply-to.

## reCAPTCHA

Formspree's form settings have reCAPTCHA enabled. Formspree does **not** host the widget for you on a custom integration: you register your own key pair, embed reCAPTCHA yourself, and Formspree verifies the token you post against your secret. The field it reads is named exactly `g-recaptcha-response` — that name is used unchanged on both hops (browser → route handler → Formspree) rather than renamed halfway and translated back.

**Where the keys live**

| | |
|---|---|
| **Site key** (public) | `RECAPTCHA_SITE_KEY` in `src/data/site.ts`, next to `SITE_URL`. It appears in client HTML by design; that is what a site key is for. Change it there and nowhere else. |
| **Secret key** | Only in the Formspree form settings. It never enters this repo, the environment or the build. This codebase cannot verify a token — it only carries one. |

If the key pair is ever reissued, the new site key goes in `src/data/site.ts` and the new secret in Formspree's form settings, and every domain that serves the form (the Vercel production domain, any preview domain you care about, and `localhost` for development) must be listed in the reCAPTCHA admin console for the key, or Google refuses to issue tokens there.

**How it loads.** `src/components/scroll/contact-section.tsx` renders `<Script>` from `next/script` only once someone focuses or types in the form (`onFocusCapture` / `onInputCapture`), so a visitor who reads the page and leaves downloads nothing from Google — the page has no other third-party script and the hero stays at zero. `next/script` has four strategies and none of them is "on interaction" (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md`), so the gate is the render itself: no `<Script>` in the tree, no request. Its loader dedupes on `id || src` in a module-level cache, so it can never be injected twice.

**How a token is fetched.** `src/lib/recaptcha.ts` waits for `window.grecaptcha` (up to **5s**), then `grecaptcha.ready()` → `grecaptcha.execute(siteKey, { action: 'contact' })` (up to another **5s**). Tokens are single-use and expire after about two minutes, so a fresh one is fetched per submit attempt and none is ever cached.

**When Google is blocked.** Privacy extensions, corporate proxies and offline laptops all break this, so it has to fail as a decision rather than a spinner. `requestRecaptchaToken` never throws and never hangs: past the timeouts it resolves `null`, the form posts anyway with an empty token, and the **server** decides what the visitor is told — `unverified`, in plain words, with the direct email address. The client never quietly gives up, and never claims anything was sent.

**No JavaScript.** A v3 token cannot exist without JavaScript, so Formspree would reject those submissions no matter what. The form still posts natively and still gets an honest HTML answer from the handler, but a `<noscript>` notice next to the submit button now says the form needs JavaScript and gives the email address, so nobody fills in four fields to be told no afterwards. The `<noscript>` radio group that used to stand in for the reason pills was removed in the same change: it existed to make a scripting-off submission *work*, and it no longer can.

**The badge.** Google's floating bottom-right badge is hidden (`.grecaptcha-badge { visibility: hidden }` in `src/app/globals.css`) — it would hang over the whole scrolling page, and it would appear mid-scroll the moment the form was touched, attached to nothing the visitor did. Google's terms permit hiding it on one condition: a visible notice near the form crediting reCAPTCHA and linking their [Privacy Policy](https://policies.google.com/privacy) and [Terms](https://policies.google.com/terms). That notice sits under the submit button. **The two go together — delete one and you owe the other.**

## What each response means

| Code | HTTP | Meaning |
|---|---|---|
| `sent` | 200 | Formspree accepted it. The only path that claims success. |
| `not_configured` | 503 | No `CONTACT_DELIVERY_KEY`, or it isn't a Formspree endpoint. |
| `delivery_failed` | 502 | Formspree rejected it or the request failed. The provider's own message is logged server-side; the visitor gets a safe one plus the direct email address. |
| `unverified` | 400 | No reCAPTCHA token reached the handler, so nothing was forwarded — Formspree would only have rejected it. Usually a blocked or slow Google script. |
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
key set, no captcha token       400  unverified       (no outbound request made)
bare form id                    200  sent             -> https://formspree.io/f/<id>
provider 404 (form not found)   502  delivery_failed
provider 422 (monthly limit)    502  delivery_failed
network throw / timeout         502  delivery_failed
honeypot filled                 400  rejected
bad email / empty message       400  invalid
```

`e2e/contact-form.spec.ts` covers the 503 and honeypot paths against the real handler; those run in CI, where no key is set. It also stubs `google.com/recaptcha/*` in every test — with a fake loader, or with an abort where a blocked script is the thing under test — so the suite never depends on a third party answering, and it measures (with a request listener) that nothing is requested from Google until the form is touched.

`unverified` is the one branch the e2e suite cannot reach: `playwright.config.ts` clears `CONTACT_DELIVERY_KEY` for the test server, and `not_configured` is decided first. That ordering is deliberate — an unconfigured deployment sends nothing either way, and it keeps every other assertion independent of whether Google's script happened to load.

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

   Only `deliverContactMessage` would change; everything around it already speaks `sent` / `delivery_failed` / `not_configured` / `unverified`. Note that reCAPTCHA is a *Formspree* setting: moving to Resend means either verifying the token yourself (a server-side POST to `https://www.google.com/recaptcha/api/siteverify` with the secret, which would then need to be an environment variable here) or dropping it and leaning on the honeypot again.
