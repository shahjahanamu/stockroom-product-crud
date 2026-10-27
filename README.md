# Stockroom Product CRUD

Angular frontend and Spring Boot REST API for creating, viewing, editing, and deleting products.

## Requirements

- Node.js 20.19+ (or 22.12+)
- Java 8 or later (JDK)

## Run the API

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The API is available at `http://localhost:8080/api/products`. It uses an in-memory H2 database, so data is reset when the server restarts. The H2 console is at `http://localhost:8080/h2-console`.

## Run the Angular app

In another terminal:

```powershell
cd frontend
npm install
npm start
```

Open `http://localhost:4200`. The Angular development server connects to the API on port 8080.

## CI/CD practice

The repository includes GitHub Actions checks, Docker packaging, and SSH deployment
of commit-tagged images to a Linux VM. Deployment is a learning setup: there is no
login/authentication and H2 data resets on backend restart. Do not put real inventory
or secrets into the app. Add authentication, persistent storage, migrations, and TLS
before using it as a production service.

### Local checks

```bash
cd backend
sh mvnw -B verify
cd ../frontend
npm ci
npm run build
npm test -- --watch=false --browsers=ChromeHeadless
```

Tests need Chrome or Chromium (`CHROME_BIN` can select the executable). Backend
integration tests cover CRUD, missing products, and invalid input.

For a container rehearsal, from the repository root:

```bash
docker compose up --build -d
python3 scripts/smoke.py http://localhost:8081
docker compose logs
docker compose down
```

The frontend serves on port 8081; Nginx forwards `/api` to the backend. During
`npm start`, Angular's proxy forwards `/api` to the local API on port 8080.
The smoke script creates a uniquely named temporary product and cleans it up.

### GitHub CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

1. Build Angular and run its headless browser tests.
2. Run Maven verification and backend integration tests.
3. Build and start both containers, then run CRUD checks through Nginx.
4. On a successful push to `main`, publish images to GHCR, tagged with the full
   commit SHA, then deploy that version to the `staging` GitHub environment.

In GitHub branch protection/rulesets, require the `frontend`, `backend`, and
`containers` jobs before merging. Workflow files must be pushed to GitHub before
GitHub Actions can run them. No deployment infrastructure is created by these files.

### Prepare staging and production

Use a separate Linux VM for each environment (both bind port 8081). Each needs:

- Docker Engine with the Compose plugin, Python 3, Bash, and an SSH server.
- A dedicated deployment account that can run Docker without an interactive sudo
  prompt. Docker access grants substantial control over the host.
- Enough disk space for images and an inbound network route from GitHub-hosted
  runners to SSH port 22. Restrict application exposure as appropriate.
- GHCR pull access: either make both image packages public, or log in to GHCR once
  as the deployment account using a read-only package token. Store that token on
  the host using Docker's credential management; never commit it.

Create GitHub environments named `staging` and `production`. In **each environment**,
configure:

| Type | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | VM DNS hostname or IPv4 address |
| Variable | `DEPLOY_USER` | Dedicated SSH account |
| Secret | `SSH_PRIVATE_KEY` | Deployment account's Ed25519 private key |
| Secret | `SSH_KNOWN_HOSTS` | Verified SSH known-hosts entry for that VM |

Install the matching public key in the host account's `authorized_keys`. Obtain and
verify the SSH host fingerprint through your VM provider or another trusted channel;
do not trust an unverified key scan. Configure required reviewers for the production
GitHub environment where supported by your GitHub plan. Restrict both environments
to the `main` branch. Set production protection rules before running production jobs;
the YAML alone cannot enforce a reviewer requirement.

GitHub Actions publishes these two packages using its built-in token:

```text
ghcr.io/<lowercase-owner>/<lowercase-repository>/stockroom-backend:<full-commit-sha>
ghcr.io/<lowercase-owner>/<lowercase-repository>/stockroom-frontend:<full-commit-sha>
```

Allow Actions to publish packages in repository/organization settings. If a package
already exists, grant this repository access to it. Initial GHCR packages may be
private, so configure host pull access before the first deployment. You can rerun a
failed staging job after fixing access.

### Deploy, promote, and roll back

- **Staging:** merge to `main`; successful CI publishes images and calls the
  deployment workflow automatically.
- **Production:** after staging succeeds, open Actions → **Deploy or roll back** →
  **Run workflow** on `main`. Choose `production` and enter the exact full commit SHA
  tested in staging. Approve the environment job if configured. No images are rebuilt.
- **Rollback:** run the same workflow with the previous successful commit SHA.
  Keep those GHCR image versions available. Rollback is manual; a failed smoke test
  fails the deployment job and prints logs, but does not automatically restore a version.

The deployment workflow uses strict SSH host verification, validates its inputs,
serializes deployments per environment, and writes files under
`~/stockroom-staging` or `~/stockroom-production`. A successful smoke check records
`deployed-sha` in that directory. It does not deploy pull-request code, provision VMs,
configure DNS/TLS, or preserve in-memory database contents. Manual promotion trusts
you to select a version already verified in staging.

For networks with a corporate/cloud proxy, Docker accepts standard `HTTP_PROXY` and
`HTTPS_PROXY` build arguments. Optional BuildKit secrets are supported:
`maven_settings` (Maven settings XML), `java_cacerts` (trusted Java CA store), and
`ca_bundle` (PEM CA bundle for npm). Supply these through a local Compose override
or `docker build --secret`; keep network-specific files outside the repository.
These secrets are mounted only during dependency installation and are not copied
into runtime images. Normal GitHub-hosted builds need none of these overrides.
