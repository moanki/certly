# Certly

Certly is a professional certification mock-exam portal. The first preset targets Huawei HCIP-Datacenter Facility Deployment with practice and exam modes.

## Included

- One-question-at-a-time exam simulator with timed and untimed runs
- Randomized questions and options, mark for review, navigator, and autosaved answers
- Exact-match scoring for multiple-answer questions, immediate results, explanations, weak topics, and time per question
- Admin login backed by Appwrite labels
- PDF and CSV upload, preview, and reviewed import into Appwrite
- Persisted attempts and answer analytics

## Local setup

1. Copy `.env.example` to `.env.local` and provide the server-side Appwrite API key.
2. Run `npm install`.
3. Run `npm run appwrite:provision`.
4. Create an Appwrite admin user in the Console and add the `admin` label, or set `CERTLY_ADMIN_EMAIL` and `CERTLY_ADMIN_PASSWORD` locally and run `npm run appwrite:create-admin`.
5. Run `npm run dev` and open `http://localhost:3000`.

Remove the one-time `CERTLY_ADMIN_*` values after account creation. The API key must never use a `NEXT_PUBLIC_` prefix or be committed. Use a restricted runtime key in Vercel and a separate local provisioning key. See [docs/architecture.md](docs/architecture.md) for environment boundaries and [docs/security.md](docs/security.md) for the OWASP-aligned baseline.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Release branches

`test` is the Vercel Preview branch. `main` is production. Configure Appwrite variables independently in Vercel Preview and Production before promoting a release.
