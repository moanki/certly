# Certly security baseline

Certly targets OWASP ASVS 5.0 Level 1 for the public mock-exam portal, with additional controls for the admin and upload paths. This is an engineering baseline, not a certification or penetration-test report.

## Implemented controls

- Appwrite API keys remain server-only. Browser code never receives an Appwrite key or admin session secret.
- Admin sessions use an `HttpOnly`, `Secure` production cookie with `SameSite=Strict`, an eight-hour maximum lifetime, and live Appwrite label checks.
- State-changing APIs enforce same-origin browser requests and bounded request bodies.
- Login, attempt submission, answer checking, and imports have per-instance rate limits. Production should add an edge/distributed rate limiter when usage grows beyond the initial team.
- The public question feed excludes answer keys, rationales, explanations, and source references. Practice answers are returned only after an explicit check; exam scoring is performed by the server.
- Public attempt-history lookup is disabled. Attempt records are available only to authenticated admins.
- Uploaded files are private, size-limited, extension and content-type checked, signature-checked for PDF, bounded after parsing, encrypted, and antivirus-scanned by Appwrite.
- Database collections and the import bucket have no public permissions. Access is through server routes only.
- Browser responses include CSP, clickjacking, MIME-sniffing, referrer, permissions, opener/resource isolation, and HSTS headers.
- API error responses avoid stack traces and credential or role enumeration. Security-relevant server events are structured and exclude credentials.
- Production dependencies are checked with `npm audit --omit=dev` in CI.

## Key separation

Use two Appwrite keys:

- `APPWRITE_API_KEY`: runtime only; grant the minimum document read/write, file read/write, and session write scopes needed by the route handlers.
- `APPWRITE_ADMIN_API_KEY`: local provisioning only; grant database, collection, attribute, index, bucket, file, and user administration scopes. Never add this key or the bootstrap admin password to Vercel.

Rotate the current combined key after creating a restricted runtime key. Configure Vercel Preview and Production separately.

## Remaining operational work

- Add MFA for admin accounts when Appwrite MFA is enabled for the project.
- Put a distributed rate limiter or WAF rule in front of authentication and upload endpoints before opening registration publicly.
- Configure centralized alerting for repeated login failures, rejected uploads, and persistence failures.
- Run authenticated DAST and a manual penetration test before treating the platform as a high-stakes exam delivery system.
- Define retention and deletion periods for candidate names, emails, attempt answers, and uploaded source files.
