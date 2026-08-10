# Manual Medplum AWS Install Guide

## Purpose

This runbook documents a manual, staging-first install of self-hosted Medplum on AWS for OZRYN.

It is written for the operating model where:

- Medplum is the clinical backend and source of truth.
- OZRYN's frontend remains hosted separately, currently on Vercel.
- AWS is the production home for Medplum and backend clinical infrastructure.
- The first AWS Medplum environment is `staging`.
- DNS uses Route 53.
- A human operator runs the privileged AWS and CDK commands locally.

Primary references:

- Medplum AWS install: https://www.medplum.com/docs/self-hosting/install-on-aws
- Medplum AWS CDK settings: https://www.medplum.com/docs/self-hosting/aws-cdk-settings
- Medplum server config: https://www.medplum.com/docs/self-hosting/server-config
- Medplum self-hosting best practices: https://www.medplum.com/docs/self-hosting/best-practices
- Medplum monitoring: https://www.medplum.com/docs/self-hosting/monitoring
- Medplum disaster recovery: https://www.medplum.com/docs/self-hosting/disaster-recovery

## OZRYN Boundaries

Preserve these project rules during the AWS install:

- One OZRYN customer tenant maps to one Medplum `Project`.
- The Medplum `Project` is the PHI isolation boundary.
- Do not mutate Medplum's Postgres database directly.
- Do not store Medplum users, memberships, access policies, or clinical data in OZRYN persistence.
- Do not store Medplum client secrets in OZRYN persistence.
- Keep real AWS credentials, Medplum secrets, certificates, private keys, passwords, and tokens out of tracked repo files.

The Medplum AWS/CDK config should live in a separate private repository, not inside `ozryn-app`.

## Required Values

Collect these before starting:

| Value | Example | Notes |
| --- | --- | --- |
| AWS account ID | `123456789012` | Account IDs are not secrets, but do not publish unnecessarily. |
| AWS region | `us-east-1` or `us-west-2` | Prefer one region for staging unless there is a compliance reason to choose otherwise. |
| AWS CLI profile | `ozryn-staging` | SSO profile or temporary IAM role profile. |
| Environment name | `staging` | Used by Medplum config files, CloudFormation stacks, and SSM paths. |
| Base domain | `staging.medplum.ozryn.app` | Route 53 should control this zone or a delegated parent zone. For OZRYN, prefer delegating `medplum.ozryn.app` from Vercel DNS to Route 53 instead of moving the whole `ozryn.app` zone. |
| API domain | `api.staging.medplum.ozryn.app` | Used for `MEDPLUM_BASE_URL`. |
| App domain | `app.staging.medplum.ozryn.app` | Used for Medplum's hosted app. |
| Storage domain | `storage.staging.medplum.ozryn.app` | Used for binary/document storage URLs. |
| Support email | `support@example.com` | Used for system-generated messages. |
| SES sender | `no-reply@example.com` | Must be verified and production-capable, or recipient-limited in sandbox. |
| Vercel OZRYN staging URL | `https://staging.ozryn.app` | Needed for CORS and client callbacks. |
| OZRYN public tenant domain | `staging.ozryn.app` | Used by tenant host derivation. |
| OZRYN admin host | `admin.staging.ozryn.app` | Must not resolve as a tenant. |

## Step 1 - Verify Local Tools And AWS Access

Install or confirm these local tools:

- AWS CLI
- Node.js
- pnpm
- Git

Log in to AWS if using SSO:

```bash
aws sso login --profile <profile>
```

Verify the active AWS identity:

```bash
aws sts get-caller-identity --profile <profile>
```

Confirm the result is the intended staging AWS account before running any CDK commands.

Medplum's AWS install creates and manages infrastructure across services including EC2/VPC, ECS/Fargate, Elastic Load Balancing, IAM, CloudFront, CloudWatch Logs, RDS/Aurora Postgres, Route 53, S3, Secrets Manager, SSM Parameter Store, WAF, and ElastiCache/Redis. The AWS identity used for the install must be allowed to create and update those resources.

## Step 2 - Prepare Route 53 DNS

Use Route 53 for the Medplum staging domain. This keeps certificate validation and DNS records aligned with the Medplum CDK workflow.

1. Create or confirm the hosted zone for the staging domain or delegated subdomain.
2. If the hosted zone is new, update the parent DNS registrar/zone with the Route 53 name servers.
3. Wait for delegation to propagate.
4. Confirm DNS resolution before continuing.

Example checks:

```bash
aws route53 list-hosted-zones --profile <profile>
dig NS <base-domain>
```


Use the final values consistently:

- `api.<base-domain>`
- `app.<base-domain>`
- `storage.<base-domain>`

### Recommended OZRYN DNS Model With A Vercel-Registered Domain

The `ozryn.app` domain is registered through Vercel. The registrar can remain Vercel; AWS does not need to become the registrar.

For Medplum, prefer delegating only a Medplum subdomain to Route 53 instead of moving the entire `ozryn.app` DNS zone away from Vercel.

Recommended ownership model:

| DNS name | Managed by | Purpose |
| --- | --- | --- |
| `ozryn.app` | Vercel DNS | Public OZRYN frontend/root domain. |
| `www.ozryn.app` | Vercel DNS | Public OZRYN frontend alias if used. |
| `staging.ozryn.app` | Vercel DNS | OZRYN staging frontend on Vercel. |
| `admin.staging.ozryn.app` | Vercel DNS | OZRYN staging admin host, captured by the staging wildcard. |
| `*.staging.ozryn.app` | Vercel DNS | Required tenant/admin-host wildcard for OZRYN staging. |
| `medplum.ozryn.app` | Route 53 delegated zone | AWS-controlled Medplum DNS island. |
| `api.staging.medplum.ozryn.app` | Route 53 | Medplum staging API. |
| `app.staging.medplum.ozryn.app` | Route 53 | Medplum staging hosted app. |
| `storage.staging.medplum.ozryn.app` | Route 53 | Medplum staging binary/document storage domain. |

Subdomain delegation flow:

1. In Route 53, create a public hosted zone for `medplum.ozryn.app`.
2. Copy the four NS records generated by Route 53 for that hosted zone.
3. In Vercel DNS for `ozryn.app`, create NS records for `medplum.ozryn.app` using the Route 53 nameserver values.
4. Wait for delegation to propagate.
5. Use the delegated Medplum domain names in the Medplum AWS init/config values.

Separately, attach `*.staging.ozryn.app` to the OZRYN Vercel staging project.
Vercel wildcard domains require DNS-01 validation and normally require Vercel
nameservers. This is compatible with delegating only `medplum.ozryn.app` to Route
53: Vercel remains authoritative for the parent zone while Route 53 owns the
delegated Medplum DNS island.

Example Vercel DNS delegation records:

```text
Name: medplum
Type: NS
Value: ns-123.awsdns-45.com

Name: medplum
Type: NS
Value: ns-678.awsdns-90.net

Name: medplum
Type: NS
Value: ns-111.awsdns-22.org

Name: medplum
Type: NS
Value: ns-333.awsdns-44.co.uk
```

Use the actual Route 53 nameserver values, not the example values above.

Recommended Medplum staging domain values:

```text
Base domain: staging.medplum.ozryn.app
API domain: api.staging.medplum.ozryn.app
App domain: app.staging.medplum.ozryn.app
Storage domain: storage.staging.medplum.ozryn.app
```

Recommended Medplum production domain values, when production is introduced:

```text
Base domain: medplum.ozryn.app
API domain: api.medplum.ozryn.app
App domain: app.medplum.ozryn.app
Storage domain: storage.medplum.ozryn.app
```

Verify delegation before requesting certificates or deploying CDK resources:

```bash
dig NS medplum.ozryn.app
dig NS staging.medplum.ozryn.app
```

After deploy, verify the final records:

```bash
dig api.staging.medplum.ozryn.app
dig app.staging.medplum.ozryn.app
dig storage.staging.medplum.ozryn.app
```

Do not create a Route 53 hosted zone and assume it is active. A hosted zone is only authoritative after the parent zone delegates to its nameservers.

Do not use placeholder domains such as `example.com` in the actual Medplum config. Domain names are baked into generated config, ACM certificates, SSM parameters, CloudFront distributions, ALB records, callbacks, and CORS settings.

Alternative model: move the entire `ozryn.app` zone to Route 53 by replacing Vercel nameservers with Route 53 nameservers. Only use this if there is a deliberate reason to centralize all DNS in AWS. If doing this, recreate required Vercel records in Route 53 before switching nameservers so the OZRYN frontend does not lose DNS resolution.

## Step 3 - Prepare ACM Certificates

Request DNS-validated ACM certificates for:

- API domain
- App domain
- Storage domain

Important region rules:

- CloudFront certificates must be in `us-east-1`.
- If the API stack runs outside `us-east-1`, the API certificate may also need to exist in the deployment region.
- If everything runs in `us-east-1`, certificate handling is simpler.

When the certificate requests are created, add or confirm the required DNS validation records in Route 53.

Do not run `cdk deploy` until all required certificates are in `Issued` status.

Example check:

```bash
aws acm list-certificates --region us-east-1 --profile <profile>
```

If the API certificate is regional and the deployment region is not `us-east-1`, also check that region:

```bash
aws acm list-certificates --region <region> --profile <profile>
```

## Step 4 - Prepare SES Email

Medplum uses email for account verification, login instructions, invites, and password reset flows.

1. Verify the support/sender email or sending domain in SES.
2. Decide whether staging can remain in SES sandbox.
3. If staging needs to send to arbitrary recipients, request SES production access.
4. Confirm DKIM/SPF records if verifying a domain.

Example checks:

```bash
aws sesv2 get-account --region <region> --profile <profile>
aws sesv2 list-email-identities --region <region> --profile <profile>
```

Record the sender/support email for the Medplum init prompts.

## Step 5 - Create The Private Medplum Config Repo

Create a separate private repository for the Medplum CDK config. Do not create it inside `ozryn-app`.

```bash
mkdir ozryn-medplum-aws-config
cd ozryn-medplum-aws-config
git init
pnpm init
pnpm add aws-cdk-lib cdk constructs @medplum/cdk @medplum/cli
```

Add `cdk.json`:

```json
{
  "app": "node node_modules/@medplum/cdk/dist/cjs/index.cjs"
}
```

Add a `.gitignore` before running init:

```gitignore
node_modules/
cdk.out/
.env
.env.*
*.pem
*.key
*.crt
*.p12
*.pfx
```

After Medplum init, review generated files before committing anything. Commit only non-secret configuration. Do not commit private keys, local env files, passwords, tokens, or generated secret material.

## Step 6 - Run Medplum AWS Init

From the private Medplum config repo:

```bash
pnpm exec medplum aws init
```

Use `staging` as the environment name.

Expected outputs from the init flow include:

- A generated config file such as `medplum.staging.config.json`
- Optional CloudFront signing key setup
- Optional ACM certificate requests
- Optional server config values written to SSM Parameter Store

After init completes, inspect the generated config file:

```bash
cat medplum.staging.config.json
```

Confirm at minimum:

- `name` is `staging`.
- `accountNumber` is the intended AWS account.
- `region` is the intended staging region.
- `domainName` matches the staging Medplum domain.
- `apiDomainName`, `appDomainName`, and `storageDomainName` are correct.
- Certificate ARNs point to issued certificates in the correct regions.
- `apiPort` is `8103` unless there is a specific reason to use another port.
- `serverImage` is intentionally chosen.
- `serverCpu` and `serverMemory` are not underpowered for the intended staging workload.

Check that SSM Parameter Store contains the expected Medplum parameters:

```bash
aws ssm get-parameters-by-path \
  --path /medplum/staging \
  --recursive \
  --with-decryption \
  --region <region> \
  --profile <profile>
```

Treat SSM output as secret-bearing. Do not paste it into tickets, docs, commits, screenshots, or chat unless values are redacted.

The core server parameters should include values equivalent to:

- `baseUrl`
- `appBaseUrl`
- `binaryStorage`
- `storageBaseUrl`
- signing key settings
- support email

Use `SecureString` for secret and sensitive settings.

## Step 7 - Bootstrap CDK

Run CDK bootstrap once for the account and region:

```bash
pnpm exec cdk bootstrap -c config=medplum.staging.config.json
```

If CDK cannot assume publishing roles, confirm that bootstrap completed and that the AWS identity has `sts:AssumeRole` and `iam:PassRole` permissions for CDK roles.

## Step 8 - Synthesize The Stack

Run synth before diff or deploy:

```bash
pnpm exec cdk synth -c config=medplum.staging.config.json
```

If synth fails, fix config issues before continuing. Do not move to deploy until synth completes cleanly.

## Step 9 - Review The CDK Diff

Run diff:

```bash
pnpm exec cdk diff -c config=medplum.staging.config.json
```

Review the proposed changes carefully, especially:

- VPC/subnet creation
- Security groups
- IAM roles and policies
- Public load balancers
- WAF rules
- RDS/Aurora resources
- Redis/ElastiCache resources
- S3 buckets and bucket policies
- CloudFront distributions
- Route 53 records
- Secrets Manager and SSM references

Expected security changes are normal for a first deploy, but do not accept changes that point to the wrong account, wrong region, wrong domains, or overly broad manual additions.

## Step 10 - Deploy The AWS Infrastructure

Deploy the CDK stacks:

```bash
pnpm exec cdk deploy --all -c config=medplum.staging.config.json
```

Keep the terminal output. It is useful for diagnosing missing DNS records, certificate issues, IAM role problems, or failed resource creation.

After deploy, confirm the main resources exist:

```bash
aws cloudformation list-stacks --region <region> --profile <profile>
aws ecs list-clusters --region <region> --profile <profile>
aws rds describe-db-clusters --region <region> --profile <profile>
aws elasticache describe-cache-clusters --region <region> --profile <profile>
```

## Step 11 - Update Bucket Policies If Needed

If the Medplum stack is deployed outside `us-east-1`, update storage bucket policies for CloudFront access.

Preview first:

```bash
pnpm exec medplum aws update-bucket-policies staging --dryrun
```

Then apply:

```bash
pnpm exec medplum aws update-bucket-policies staging
```

Skip this only if the deployment region and current Medplum CDK behavior make it unnecessary.

## Step 12 - Deploy The Medplum App

Deploy the Medplum hosted app:

```bash
pnpm exec medplum aws deploy-app staging
```

Then verify:

- `https://app.<base-domain>/` loads.
- `https://api.<base-domain>/` responds over TLS.
- `https://storage.<base-domain>/` resolves as expected.

If app or API domains are inaccessible:

- Confirm Route 53 records exist.
- Confirm CloudFront distributions are deployed.
- Confirm ALB target groups are healthy.
- Confirm storage bucket policies allow the CloudFront distribution.
- Confirm certificates are issued and attached.

## Step 13 - Configure OZRYN Staging

Configure these values in the OZRYN staging runtime environment, not in tracked source files:

```bash
MEDPLUM_BASE_URL=https://api.<base-domain>/
MEDPLUM_ADMIN_CLIENT_ID=<admin-client-id>
MEDPLUM_PROVISIONING_CLIENT_ID=<server-only-provisioning-client-id>
MEDPLUM_PROVISIONING_CLIENT_SECRET=<server-only-provisioning-client-secret>
OZRYN_PUBLIC_BASE_DOMAIN=<ozryn-staging-tenant-domain>
OZRYN_ADMIN_HOST=<ozryn-staging-admin-host>
```

Rules:

- `MEDPLUM_BASE_URL` is deployment-wide.
- `MEDPLUM_ADMIN_CLIENT_ID` is used for admin login only.
- Provisioning client credentials are server-only.
- Tenant-specific Medplum client IDs are persisted in OZRYN tenant rows.
- Tenant-specific Medplum client secrets are not persisted in OZRYN.

Update the Medplum server config/CORS settings so OZRYN staging origins are allowed. At minimum, include:

- Vercel staging URL
- OZRYN admin host
- OZRYN tenant host pattern or the concrete tenant staging hosts used for validation

Use Medplum's AWS config update flow for server config changes:

```bash
pnpm exec medplum aws update-config medplum.staging.server.json
```

Treat `medplum.staging.server.json` as sensitive until reviewed. Do not commit it if it contains secrets.

## Step 14 - Create Or Confirm Super Admin Access

Self-hosted Medplum includes a Super Admin project. Restrict access tightly.

Manual validation:

1. Sign in to `https://app.<base-domain>/`.
2. Confirm the operator account can access the Super Admin project.
3. Visit `/admin/super`.
4. Confirm maintenance actions are visible but do not run destructive actions during normal validation.

Super Admin actions can permanently affect the system. Use them only for maintenance tasks such as rebuilding definitions, reindexing, or controlled administrative recovery.

## Step 15 - Smoke Test Medplum

Run the minimum Medplum checks before connecting real OZRYN workflows:

- App login works.
- Password reset or invite email works.
- API health responds over TLS.
- A basic FHIR read succeeds.
- A basic FHIR write succeeds in a test project.
- Binary upload/download works through configured storage.
- Audit events are created.
- CloudWatch logs receive Medplum server logs.

Example API checks:

```bash
curl -i https://api.<base-domain>/metadata
curl -i https://api.<base-domain>/healthcheck
```

The exact authentication-bearing tests should be run with local credentials or scripts that keep tokens out of shell history and tracked files.

## Step 16 - Smoke Test OZRYN

Run the minimum OZRYN staging checks:

1. Open the OZRYN admin host.
2. Sign in with the configured Medplum admin client.
3. Create a test tenant from the admin control plane.
4. Confirm OZRYN creates the Medplum `Project`.
5. Confirm OZRYN creates the tenant `Organization`.
6. Confirm OZRYN creates the tenant `ClientApplication`.
7. Confirm the first tenant admin invite is delivered.
8. Confirm the tenant row is persisted with:
   - tenant slug
   - display name
   - status
   - bootstrap status
   - Medplum project ID
   - Medplum organization ID
   - Medplum client ID
9. Open the tenant host.
10. Sign in as the tenant admin.
11. Confirm tenant-scoped Medplum data loads.
12. Confirm `/settings/users` works for tenant-admin membership management.

Do not validate by directly editing Medplum database tables.

## Step 17 - Add Observability Baseline

Before staging is considered usable for serious testing, configure monitoring for:

- API 5xx rates
- ALB unhealthy target count
- ECS task restarts
- ECS CPU and memory
- Medplum server heap/memory signals where exported
- RDS CPU
- RDS free storage
- RDS database connections
- Redis connectivity and saturation
- CloudFront errors
- SES bounce/complaint/sending failures
- WAF blocks

Medplum server metrics can expose useful OpenTelemetry signals, including database and Redis health check round-trip time, FHIR operation counts, FHIR error rates, Node heap usage, and subscription queue depth.

At minimum, create CloudWatch dashboards and alarms for the AWS-native resources. Add OpenTelemetry or a commercial observability backend later if needed.

## Step 18 - Confirm Backup And Restore Posture

Before production use, but ideally during staging setup:

1. Confirm RDS automated backups are enabled.
2. Confirm point-in-time recovery retention.
3. Confirm deletion protection expectations for staging and production.
4. Document the target RPO and RTO.
5. Run a restore drill from a snapshot into a non-production environment.
6. Confirm the restored Medplum app can connect to the restored database.
7. Record the exact recovery steps and timing.

Medplum's disaster recovery posture depends primarily on durable Postgres backups, reproducible infrastructure, stateless app servers, and DNS/load-balancer traffic routing.

## Step 19 - Document Upgrade Procedure

Use staging before production for all Medplum upgrades.

Infrastructure upgrade flow:

```bash
pnpm exec cdk diff -c config=medplum.staging.config.json
pnpm exec cdk deploy -c config=medplum.staging.config.json
```

App upgrade flow:

```bash
pnpm exec medplum aws update-app staging
```

Server upgrade flow:

```bash
pnpm exec medplum aws update-server staging
```

Before applying upgrades to production:

- Run upgrades in staging.
- Run OZRYN smoke tests.
- Confirm tenant provisioning still works.
- Confirm Medplum login and invites still work.
- Confirm binary storage still works.
- Confirm monitoring and logs still work.

Stay close to current Medplum releases. Avoid falling multiple minor versions behind without a deliberate upgrade plan.

## Manual Completion Checklist

Use this checklist to close the staging install:

- [ ] AWS identity verified against the intended account.
- [ ] Route 53 hosted zone created or confirmed.
- [ ] If using `ozryn.app`, `medplum.ozryn.app` delegation from Vercel DNS to Route 53 confirmed.
- [ ] DNS delegation confirmed with `dig NS medplum.ozryn.app` or the equivalent environment-specific delegated zone.
- [ ] ACM certificates issued.
- [ ] SES sender/domain verified.
- [ ] Private Medplum config repo created.
- [ ] `.gitignore` excludes local secrets and key material.
- [ ] `medplum.staging.config.json` generated and reviewed.
- [ ] SSM `/medplum/staging/...` parameters verified.
- [ ] CDK bootstrap completed.
- [ ] CDK synth completed.
- [ ] CDK diff reviewed.
- [ ] CDK deploy completed.
- [ ] Bucket policies updated when required.
- [ ] Medplum app deployed.
- [ ] API, app, and storage domains resolve over TLS.
- [ ] Medplum login and email flows work.
- [ ] FHIR read/write smoke tests pass.
- [ ] Binary storage smoke test passes.
- [ ] OZRYN staging env vars configured outside repo.
- [ ] OZRYN admin login works.
- [ ] OZRYN tenant provisioning works.
- [ ] Tenant admin login works.
- [ ] `/settings/users` works for tenant admins.
- [ ] CloudWatch logs and baseline alarms configured.
- [ ] RDS backup/PITR settings confirmed.
- [ ] Restore drill documented before production.
