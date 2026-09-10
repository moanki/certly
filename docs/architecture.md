# Certly architecture

Certly is a Next.js App Router application hosted on Vercel. Appwrite Cloud stores questions, imports, admin identities, attempts, and per-question analytics.

## Runtime boundaries

- Candidate identity is lightweight: name is required and email is optional.
- Admins authenticate through Appwrite email/password accounts with the `admin` label.
- The Appwrite API key stays on the server and is used only by route handlers.
- Uploaded PDF and CSV files are stored privately. Parsed questions remain a preview until an admin imports them.
- Public question responses omit answer keys. Practice checks and exam grading happen on the server.
- Exam attempts are validated and scored on the server after submission. Results appear immediately even if history persistence fails.
- Attempt history is private to authenticated admins; the public UI only shows attempts made during the current browser session.

## Environments

- `test` branch: Vercel Preview deployment and test Appwrite resources when a separate test project is added.
- `main` branch: Vercel Production deployment.
- Vercel environment variables must be configured separately for Preview and Production.

## Initial Appwrite resources

Database `certly` contains `certifications`, `exam_presets`, `questions`, `attempts`, `attempt_answers`, and `imports`. Bucket `imports` accepts private PDF and CSV files up to 10 MB.

See [security.md](security.md) for the OWASP-aligned control baseline and deployment requirements.
