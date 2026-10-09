# Branch Plan: `infra/aws-terraform`

**Depends on:** nothing — can start immediately in parallel with everything
else
**Blocks:** real deployment (not local dev — app/services run locally against
a local/dev Postgres and local FastAPI until this lands)

## Goal

Provision the AWS resources needed to run InvoiceIQ AI in a real environment:
RDS Postgres, ECS/EC2 for the Next.js app and the Python anomaly-engine, and
IAM access to Bedrock.

## Scope

Terraform in `infra/`, organized as:

1. `infra/network/` — VPC, subnets (public for ALB, private for
   RDS/ECS tasks), security groups.
2. `infra/rds/` — RDS Postgres instance (dev-sized, e.g. `db.t4g.micro`/
   `db.t4g.small` for a hackathon-scale build), parameter group, subnet
   group, credentials via AWS Secrets Manager (not plaintext vars).
3. `infra/ecr/` — two ECR repositories: `invoiceiq-web` (Next.js) and
   `invoiceiq-anomaly-engine` (FastAPI).
4. `infra/ecs/` — ECS cluster (Fargate, to avoid managing EC2 instances
   unless the team specifically wants EC2), two services:
   - `web` — Next.js container, ALB target, env vars from Secrets
     Manager/SSM (`DATABASE_URL`, `ANOMALY_ENGINE_URL`, `BEDROCK_MODEL_ID`).
   - `anomaly-engine` — FastAPI container, internal-only (no public ALB
     needed, reachable from `web`'s ECS task via service discovery/internal
     DNS).
5. `infra/iam/` — task execution role + task role for the `web` service with
   least-privilege `bedrock:InvokeModel` permission scoped to the chosen
   model ID; RDS access via security group only (no broad IAM DB auth needed
   for v1 unless the team wants IAM-based Postgres auth).
6. `infra/bedrock/` — confirm model access is enabled in the target region
   (Bedrock model access must be explicitly requested per-account before
   `InvokeModel` works) — document this as a manual one-time console step
   since Terraform can't enable model access itself.
7. Root `infra/main.tf` wiring the above modules together, `infra/variables.tf`,
   `infra/outputs.tf` (RDS endpoint, ECR repo URLs, ALB DNS name).

## Definition of Done

- `terraform plan` succeeds with no errors against a real AWS account
  (requires credentials — not run in this session).
- Secrets (DB password, etc.) are never in `.tf` files or state in plaintext
  — RDS-managed credentials in Secrets Manager. Do not use `random_password`
  for this requirement: its result is stored in Terraform state.
- Outputs provide everything `feat/data-schema-contract`'s `.env.example`
  needs (`DATABASE_URL` shape, Bedrock model ID/region).

## Open decisions (flag to the team before building)

- AWS account/region to deploy into.
- Fargate vs. EC2-backed ECS (Fargate recommended for a 3-person hackathon
  team — far less ops overhead).
- Which Bedrock model (e.g. Anthropic Claude via Bedrock) — affects
  `BEDROCK_MODEL_ID` and the prompt format in `feat/ai-explanations`.
- Terraform remote state backend (S3 + DynamoDB lock table) vs. local state
  for a short-lived hackathon build.

## Notes

- This branch also owns the final **`env-config-wiring`** step from the
  overall plan: once infra outputs exist, wire the real `DATABASE_URL` /
  `ANOMALY_ENGINE_URL` / `BEDROCK_MODEL_ID` into both the Next.js app's and
  the anomaly-engine's deployed environment (ECS task definitions), replacing
  local dev defaults.

## Implementation decisions

- Branch: `infra/aws-terraform`, based on current `origin/main`.
- Approved defaults: Fargate, `us-east-1`, local state initially, configurable
  Bedrock model/explicit invocation ARNs, AWS-managed RDS credentials.
- Deployment and runtime contracts are documented in [infra/README.md](../infra/README.md).
  Both services receive real configuration via their ECS task definitions;
  database URLs are assembled only at container startup, outside Terraform.
- [Bedrock prerequisites](../infra/bedrock/README.md) are a manual account step.
  Current AWS access behavior varies by provider; do not assume every model
  requires the legacy model-access request flow.
- Both services initially have zero tasks so ECR images can be published before
  launch. Image build/migrations depend on the app and anomaly-engine branches.
- Local verification uses mock-provider Terraform tests and launcher tests.
  A real-account `terraform plan`, model invocation, and deployed end-to-end
  checks remain mandatory deployment gates and are not run in this session.
