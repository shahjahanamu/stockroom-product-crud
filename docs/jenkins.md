# Run CI/CD with Jenkins

`Jenkinsfile` provides the same application checks as GitHub Actions. It uses a
Jenkins Multibranch Pipeline. You can keep both systems for CI, but choose one
system to own deployments so they do not deploy to the same VM concurrently.

## 1. Prepare Jenkins

Use a supported Jenkins LTS controller and a dedicated Linux build agent labeled
`stockroom`. Run builds on the agent rather than the controller. Install:

- Pipeline (including Declarative Pipeline), Git, GitHub Branch Source,
  Credentials Binding, JUnit, and Timestamper plugins.
- Node.js 22 with npm, JDK 21, Python 3, Git, Bash, OpenSSH client, and `sha256sum`.
- Docker Engine, Compose v2, and Buildx. The agent account must be able to run
  Docker. Docker access gives substantial control over that machine.
- Chrome/Chromium with a working browser sandbox. Set the agent's `CHROME_BIN`
  environment variable if Chromium is not automatically discovered. Do not run
  browser tests as root on a normal Jenkins agent.

The agent needs outbound access to GitHub/GHCR, npm, Maven Central, and Docker Hub.
For corporate proxies, configure the agent's package-manager trust and Docker
build settings as described in the repository README; never disable TLS checks.
The pipeline gives each build its own Compose project and a dynamically allocated
HTTP port, allowing independent jobs on the same agent.

## 2. Create a Multibranch Pipeline

1. Create a Jenkins **Multibranch Pipeline** job.
2. Add a GitHub branch source for `shahjahanamu/stockroom-product-crud`.
3. Configure repository-read authentication if needed. Private GitHub credentials
   belong in Jenkins Credentials, not in the repository.
4. Enable branch and pull-request discovery, with the build configuration set to
   `Jenkinsfile`. Scan the repository. The file must exist on the selected branch.
5. Configure a GitHub webhook to your Jenkins endpoint (`/github-webhook/`), or
   configure periodic branch indexing if Jenkins is not reachable from GitHub.

Do not run untrusted fork code on a privileged Docker agent or expose deployment
credentials to it. Restrict who can modify `main`, the Jenkinsfile, job configuration,
credential bindings, and the agent. GitHub's environment approvals do not apply to
Jenkins deployments.

## 3. Start with CI only

The default build parameters are:

| Parameter | Default | Purpose |
|---|---|---|
| `PUBLISH_IMAGES` | `false` | Publish tested images from main |
| `DEPLOY_TARGET` | `none` | Choose none, staging, or production |
| `DEPLOY_IMAGE_TAG` | blank | Full existing image SHA for promotion/rollback |

A branch build checks out the code and runs three parallel checks:

- **Frontend:** `npm ci`, Angular production build, and headless Chrome tests.
- **Backend:** `sh mvnw -B verify`; JUnit results appear in Jenkins.
- **Container integration:** builds and starts Compose, then runs `scripts/smoke.py`
  through Nginx. Logs are collected and containers/volumes are removed afterward.

No registry or deployment credentials are needed for this default CI-only mode.
Non-main jobs reject publishing/deployment requests. Parameters normally appear
as **Build with Parameters** after the first pipeline run.

## 4. Configure CD credentials

Create credentials scoped to the trusted job/folder. These IDs are referenced by
`Jenkinsfile`:

| Credential ID | Jenkins credential type | Contents |
|---|---|---|
| `stockroom-ghcr` | Username with password | GitHub username and a token with package write access; the account needs access to both packages |
| `stockroom-staging-ssh` | SSH Username with private key | Staging deployment account and its private key |
| `stockroom-staging-host` | Secret text | Staging DNS hostname or IPv4 address |
| `stockroom-staging-known-hosts` | Secret file | Verified SSH known-hosts file for staging |
| `stockroom-production-ssh` | SSH Username with private key | Production deployment account and its private key |
| `stockroom-production-host` | Secret text | Production DNS hostname or IPv4 address |
| `stockroom-production-known-hosts` | Secret file | Verified SSH known-hosts file for production |

Jenkins does not receive GitHub Actions' automatic `GITHUB_TOKEN`. Use an appropriate
GHCR credential and authorize organization SSO if your organization requires it.
Never paste tokens into Jenkinsfile or build parameters. Verify SSH host keys through
a trusted channel. The pipeline does not accept password-protected SSH keys because
it runs noninteractively without an SSH agent; use a dedicated restricted deployment
key and protect its Jenkins credential.

Prepare separate staging and production VMs using the prerequisites in README:
Docker Compose, Python 3, Bash, SSH, a Docker-capable deployment account, and GHCR
pull access for private images. Each host serves port 8081. Remote deployments use
`~/stockroom-staging` or `~/stockroom-production` and strict SSH host verification.
No hosts, credentials, DNS, TLS, or Jenkins controller are created by this repository.

## 5. Publish and deploy

From the **main** branch job, select **Build with Parameters**:

- **Publish only:** set `PUBLISH_IMAGES=true`, keep `DEPLOY_TARGET=none` and SHA blank.
- **Staging:** set `DEPLOY_TARGET=staging`, leave SHA blank. After all CI checks pass,
  the exact Docker images used by the container check are tagged with the commit SHA,
  published to GHCR, and deployed. Selecting a deployment target also enables publishing.
- **Production promotion:** set `DEPLOY_TARGET=production` and enter the full commit SHA
  already verified in staging. Existing images are deployed without rebuilding or
  republishing them. The pipeline still runs CI checks on its checked-out source;
  those checks are distinct from the selected image version. Deployment smoke checks
  exercise the selected images themselves.
- **Rollback:** select the environment and enter a previous successful full commit SHA.
  Keep those image versions available in GHCR. Rollback is manual.

Before production use, configure a Jenkins security group named
`stockroom-release-managers` with the users permitted to approve production. The
pipeline waits up to 15 minutes for one of those users to approve. Jenkins
administrators can also approve input steps. Approval identity is controlled by your
Jenkins security realm, not by a build parameter.

Deployments run `scripts/jenkins-deploy.sh`: validate inputs, pull images, recreate
containers, perform CRUD smoke checks, and record `deployed-sha` only after success.
A failed smoke check fails the build and prints logs; it does not automatically
restore the previous version. Main builds are serialized, including approval and
deployment. Coordinate with any other deployment jobs targeting these hosts.

The database is still in-memory H2 and resets on backend replacement. This setup
is for CI/CD practice; add persistent storage, authentication, migrations, and TLS
before using it for real inventory.

## Validation scope

The application builds, tests, and Docker CRUD checks have been exercised in the
cloud workspace. Jenkins pipeline syntax can be checked locally, but execution of
the Declarative Pipeline, credentials, approvals, and SSH deployment must be verified
on your Jenkins installation. This repository does not include a running controller.
