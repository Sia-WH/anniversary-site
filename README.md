This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Password reset: free Gmail SMTP setup

The login page links to `/forgot-password`. Supabase sends the recovery email,
`/auth/callback` exchanges its PKCE code for session cookies, and `/reset-password`
lets the authenticated user choose and confirm a new password. A successful reset
signs the user out so they can log in with the new password. Passwords and recovery
tokens are managed by Supabase Auth; no additional database table is required.

### 1. Configure a free personal Gmail sender

For this small private site, an eligible free Gmail account can send recovery
emails without buying a domain or subscribing to an email service. This is a
limited-volume option, not unlimited free delivery. Google documents a personal
Gmail sending limit of 500 emails/day; spam protection may impose other limits.
Supabase Auth also has its own project limits.

1. Enable **2-Step Verification** on the Google account used to send emails.
2. Open [Google App passwords](https://myaccount.google.com/apppasswords) and
   create an app password named `Supabase Auth`.
3. In your Supabase project, open **Authentication → Email → SMTP Settings**
   (or the **Custom SMTP** section, depending on the dashboard layout), enable
   custom SMTP, and enter:

   | Setting | Value |
   | --- | --- |
   | Sender email | Your full Gmail address |
   | Sender name | Sia & Mui |
   | Host | `smtp.gmail.com` |
   | Port | `587` (TLS/STARTTLS) |
   | Username | The same full Gmail address |
   | Password | The generated 16-character app password, without spaces |

Use the app password, not your Google account password. Save it only in Supabase's
SMTP settings; it is not a frontend environment variable or a Vercel secret needed
by this implementation. The sender address must match the Gmail account.

If App passwords is unavailable, check Google's documented restrictions (work or
school accounts, Advanced Protection, or security-key-only 2-Step Verification).
Do not disable account security to work around this. If you already own a domain,
an alternative is a dedicated mail provider's free SMTP tier with that domain
verified; a `vercel.app` subdomain does not give you DNS control for sender-domain
verification.

Supabase's default SMTP is limited to project-team recipients and currently
2 emails/hour. It is not suitable for ordinary application users. Custom SMTP
initially has its own low rate limit (currently 30 messages/hour); adjust only
within your sender's limits under **Authentication → Rate Limits**.

Sources checked on 2026-10-05:
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Google app passwords](https://support.google.com/accounts/answer/185833),
[Gmail SMTP settings](https://support.google.com/mail/answer/7104828),
[Gmail sending limits](https://support.google.com/mail/answer/22839).

### 2. Set the deployed URLs in Supabase

In **Authentication → URL Configuration**:

- Set **Site URL** to your actual production origin, for example
  `https://your-site.vercel.app`.
- Add the exact `https://your-site.vercel.app/auth/callback` to **Redirect URLs**.
- For development, also add `http://localhost:3000/auth/callback`.
- If you test a separate Vercel preview deployment, add its exact callback URL too.

Replace `your-site.vercel.app` with the domain you actually use to open the site.
The request uses the current website origin, so each origin used for testing must
be allowed. Prefer exact production URLs rather than broad wildcard allowlists.

In **Authentication → Email Templates → Reset Password**, ensure the button/link
uses Supabase's `{{ .ConfirmationURL }}`. A custom template linking directly to
`{{ .SiteURL }}` will skip recovery verification. For example:

```html
<h2>Reset your password</h2>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>
```

The frontend requires at least 8 characters; Supabase's configured password policy
is authoritative and can require stronger passwords. Keep Supabase's minimum
password length at 8 or above in the email/password provider settings.

### 3. Deploy and verify

Deploy these code changes through your existing Vercel workflow. Keep the existing
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; no new frontend
credentials or packages are needed.

1. Open the deployed login page while signed out and select **Forgot password?**.
2. Submit an existing account's email and verify an email arrives (check spam too).
3. Open the link **in the same browser/device where you requested it**. This
   implementation uses Supabase SSR's PKCE flow, which needs that browser's
   verifier cookie. Opening the email on another device/browser will fail safely.
4. Enter matching passwords of at least 8 characters and submit.
5. Confirm the new password logs in and the previous password no longer works.
6. Test an expired/reused link: it should offer to request a new link.
7. Test an unknown email: the website should show the same neutral request
   confirmation, without revealing whether an account exists.

If delivery fails, check Supabase Auth logs, Gmail SMTP credentials, and rate
limits. If a link redirects to localhost, check Site URL and the callback
allowlist. Link failures in a different browser require a fresh request from
that browser. Changes to your Google account password revoke app passwords;
generate a new one and update Supabase if that happens.

Local checks: `node --test scripts/*.test.mjs`, `npx tsc --noEmit`, and `npm run build`.
Actual email delivery requires the dashboard configuration and a live account.
