# InvoiceIQ AWS infrastructure

PLAN-11 provisions a two-AZ VPC, public ALB subnets, private Fargate/RDS
subnets, one NAT gateway, encrypted PostgreSQL 16, two immutable ECR
repositories, Cloud Map internal DNS, CloudWatch logs, and scoped IAM roles.
Only the web service is exposed through the ALB. The anomaly engine is
reachable from web at `http://anomaly-engine.invoiceiq-dev.internal:8000`.
Region and environment are configurable; defaults are `us-east-1` and `dev`.

## Credentials and runtime configuration

RDS generates and manages the database password in Secrets Manager using
`manage_master_user_password`. Terraform stores the secret **ARN**, never the
password or secret value. This deliberately replaces the plan's suggested
`random_password`: that resource would put a plaintext password in state even
when marked `sensitive`. Do not add secret-value data sources or password vars.

ECS injects `DB_CREDENTIALS` from that secret at task startup. Small Node and
Python launchers assemble URL-encoded, TLS-required `DATABASE_URL` values and
remove the raw secret from the child application's environment. The web and
anomaly-engine tasks both receive `DATABASE_URL`, `ANOMALY_ENGINE_URL`,
`BEDROCK_MODEL_ID`, and `AWS_REGION`. Non-secret model ID and service URL are
managed in SSM Parameter Store and embedded into task definitions by Terraform;
changing them requires a Terraform apply, not just editing SSM independently.
Do not expose these settings via `NEXT_PUBLIC_` or log connection strings.

RDS uses its AWS-managed Secrets Manager encryption key. If a customer-managed
key is introduced later, scope `kms:Decrypt` on the execution roles to that key.
Task roles cannot read secrets; only execution roles can inject them. Only the
web task has Bedrock invocation permissions. Database access is restricted to
the two task security groups on port 5432, with SSL enforced by PostgreSQL.

This dev deployment uses the managed database owner credential. Production
needs separate least-privilege SQL users, verified server certificates, private
endpoints as appropriate, and automated handling of secret rotation. RDS rotates
managed credentials; existing ECS tasks retain their startup secret. Redeploy
**both** services after rotation before pooled connections need to reconnect.
Automated rotation-triggered rollouts are not included in this hackathon scope.

## Local checks (no AWS credentials)

Install Terraform >= 1.11 (tested with 1.13.5), Node.js, and Python >= 3.10.
Run from the repository root:

```powershell
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
terraform -chdir=infra test
node --test infra/tests/entrypoints.test.cjs
python -B -m unittest discover -s infra/tests -p '*_test.py' -v
```

The Terraform tests use a **mock AWS provider**, including a mocked apply for
computed outputs. They do not provision resources or replace a real AWS plan.
Commit `.terraform.lock.hcl`; keep state, plans, `.terraform/`, and local
variable files out of Git. Local state is the approved initial default. Protect
it with local access controls even though this config does not store passwords.

## Account setup and bootstrap

No real AWS plan or apply has been executed for this implementation.
Deployment creates billable resources; even with zero tasks, RDS, NAT, ALB,
public IPv4, logs, storage, and secret management have costs. Confirm budget,
target account, quotas, model availability, and regional instance availability.

1. Use AWS CLI v2 with a short-lived SSO/profile session. Verify the intended
   account with `aws sts get-caller-identity`. The provisioning identity needs
   permissions for VPC, RDS, ECS, ECR, ELB, Cloud Map, SSM, CloudWatch, IAM role
   creation/PassRole, Secrets Manager, and any needed service-linked roles.
   Never put AWS access keys in Terraform files.
2. Complete [Bedrock account setup](bedrock/README.md). Agree on the exact model
   and resource ARNs with the AI team; the example does not select one for you.
3. Copy `terraform.tfvars.example` to `terraform.tfvars`, edit region/model
   settings and client CIDRs, and leave both desired counts at zero for bootstrap.
   Public access defaults to all IPv4 clients; restrict CIDRs for a private demo.
   Provide a regional ACM certificate for HTTPS. Empty certificate means
   **dev-only HTTP**: do not upload real financial data in that mode. With a
   certificate, create DNS for its hostname pointing to the ALB and use that
   hostname; the raw ALB DNS name will not match the certificate.
4. Authenticate, then review a real plan before applying:

```powershell
$env:AWS_PROFILE = 'invoiceiq-dev'
aws sso login --profile invoiceiq-dev
aws sts get-caller-identity
terraform -chdir=infra init
terraform -chdir=infra plan -out=bootstrap.tfplan
terraform -chdir=infra apply bootstrap.tfplan
terraform -chdir=infra output
```

ECR repository names are fixed per the plan (`invoiceiq-web` and
`invoiceiq-anomaly-engine`), so this configuration owns one deployment per
account/region. Import existing repositories rather than creating duplicates.
The single NAT gateway and single-AZ RDS are dev cost tradeoffs, not production
high availability. The ALB will return 503 until healthy web tasks are running.

## Publish images and launch services

App Dockerfiles are owned by the app/service branches and are not invented in
this infra branch. Build Linux **amd64** images and push them to the output ECR
URLs with immutable release tags. The default tags are `initial`; use a new tag
for every later release. Example after bootstrap, from the repository root:

```powershell
$repos = terraform -chdir=infra output -json ecr_repository_urls | ConvertFrom-Json
$webRepo = $repos.'invoiceiq-web'
$anomalyRepo = $repos.'invoiceiq-anomaly-engine'
$registry = $webRepo.Split('/')[0]
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $registry
docker build --platform linux/amd64 -t "${webRepo}:initial" .
docker push "${webRepo}:initial"
docker build --platform linux/amd64 -t "${anomalyRepo}:initial" services/anomaly-engine
docker push "${anomalyRepo}:initial"
```

Use your configured region in the login command. These commands require the
corresponding Dockerfiles to have landed; they cannot run on the current scaffold.

Container contracts:

- Web image: Node.js on PATH, production `.next` output and runtime dependencies,
  correct WORKDIR, listening on `0.0.0.0:3000`. Default command is
  `node node_modules/next/dist/bin/next start`. For a standalone image set
  `web_start_command = ["node", "server.js"]` and include static/public assets.
  Terraform replaces the image ENTRYPOINT/CMD to run the secret-aware launcher.
- Engine image: `python` on PATH, FastAPI/uvicorn installed, correct WORKDIR,
  default module `main:app`, listening on `0.0.0.0:8000`, and `GET /health`
  returning 200. Adjust `anomaly_start_command` and health path if the service
  contract differs. Its ENTRYPOINT/CMD is likewise replaced by the launcher.
- Both task sizes initially use 0.25 vCPU/512 MiB. Increase the task-definition
  sizes if the finance dataset/model needs more memory. Bootstrap supplies a
  database, not schema migrations or dataset imports; run those from a private
  task using the schema/ingestion branches before exercising database routes.

After both images are pushed, set `web_desired_count = 1` and
`anomaly_desired_count = 1` in your local variables and apply a reviewed plan.
Update image tags in the same variables for future releases. Check ECS events,
ALB target health, and `/ecs/invoiceiq-dev/{web,anomaly}` logs, then verify web
requests reach the engine and database and a Bedrock explanation succeeds.
Internal engine DNS and RDS are not reachable directly from a laptop.

For a manual credential-rotation rollout, after authenticating to the account:

```powershell
$cluster = terraform -chdir=infra output -raw ecs_cluster_name
aws ecs update-service --cluster $cluster --service web --force-new-deployment --region us-east-1
aws ecs update-service --cluster $cluster --service anomaly-engine --force-new-deployment --region us-east-1
```

Outputs include RDS endpoint, secret ARN, ECR URLs, ALB DNS/URL, internal engine
URL, Bedrock ID/region, and a password-free `database_url_template` for the
schema branch's environment contract. Never export a real password via outputs.

## Shared state and cleanup

Before collaborative deployment, create an encrypted, versioned, non-public S3
bucket with tightly scoped IAM outside this stack. Add a local `backend.tf`
block and migrate state with `terraform -chdir=infra init -migrate-state`:

```hcl
terraform {
  backend "s3" {
    bucket       = "YOUR-STATE-BUCKET"
    key          = "invoiceiq/dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

Native S3 lockfiles are supported by the chosen Terraform version; a DynamoDB
lock table is unnecessary for new deployments. Backend names and policies must
be agreed with the team before migration. Do not deploy from concurrent local
states or commit account-specific backend credentials.

Destroy only after team approval. First set `deletion_protection = false` and
apply that change, then empty ECR repositories deliberately and review
`terraform destroy`. RDS always takes a final snapshot; the predictable
`invoiceiq-<environment>-final` name must be unique at deletion time. Prior
snapshots/backups can continue billing after destroy, and snapshots must not be
deleted without the data owner's approval. ECR force deletion is disabled.