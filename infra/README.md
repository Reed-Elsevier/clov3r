# infra/ — AWS (Terraform)

**Stage 1 (current): minimal dev backbone.** A private RDS Postgres you reach
from your laptop through an SSM tunnel, plus Bedrock access with your own
SSO credentials. The Next.js app runs locally against both. ECR/ECS/ALB from
[PLAN-11](../docs/PLAN-11-infra-terraform.md) come later, once there's an app
worth deploying.

```
laptop ──(aws ssm port-forward, IAM-authenticated)──► bastion (t4g.nano, no inbound ports)
   │                                                        │ 5432
   │                                                        ▼
   │                                              RDS Postgres 17 (private subnets)
   └──(SSO credentials)──► Amazon Bedrock (ap-southeast-2)
```

| Path | What |
|---|---|
| `bootstrap/` | One-time S3 bucket for shared Terraform state (versioned, encrypted, TLS-only) |
| `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf` | Root stack (region `ap-southeast-2`, S3 backend with native locking) |
| `modules/network` | VPC `10.40.0.0/16`, 2 public + 2 private subnets, no NAT |
| `modules/bastion` | SSM-only EC2 hop (Amazon Linux 2023 arm64, IMDSv2, encrypted disk) |
| `modules/rds` | Postgres 17 `db.t4g.micro`, encrypted, SSL enforced, only reachable from the bastion |
| `scripts/` | `db-tunnel.mjs`, `write-env.mjs` (Node, no dependencies), Bedrock smoke-test payload |

**Secrets:** the DB master password is generated and stored by RDS in Secrets
Manager (`manage_master_user_password`). It is never in `.tf` files or
Terraform state. RDS rotates it every 7 days, so if auth fails, re-run
`write-env.mjs`.

**Rough cost:** about US$30–35/month (≈ $1/day): RDS micro + 20 GB, nano
bastion, one public IPv4, one secret. Bedrock is pay-per-token on top. Run
`terraform destroy` when you're done (see [Teardown](#teardown)).

---

## 0. Install tools (everyone, once)

Windows (PowerShell):

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Amazon.SessionManagerPlugin
winget install -e --id Hashicorp.Terraform
```

macOS: `brew install awscli terraform session-manager-plugin`.
Open a new terminal afterwards so the tools are on `PATH`
(`aws --version`, `terraform version`, `session-manager-plugin`).

## 1. Sign in with SSO (everyone)

```powershell
aws configure sso
#   SSO session name:      invoiceiq
#   SSO start URL:         <your company's AWS access portal URL>
#   SSO region:            <region of your company's Identity Center>
#   -> pick the account + role for this project
#   CLI default region:    ap-southeast-2
#   CLI profile name:      invoiceiq

$env:AWS_PROFILE = "invoiceiq"     # bash/zsh: export AWS_PROFILE=invoiceiq
aws sts get-caller-identity        # should print the project account
```

Sessions expire. When commands start failing with token errors, run
`aws sso login --profile invoiceiq`.

### Company guardrails to check first

Company accounts often restrict things with SCPs or permission boundaries.
If any step fails with `AccessDenied` / `explicit deny`, ask your cloud
platform team. Typical blockers:

- Creating a VPC / internet gateway / public IPs (bastion needs a public IP
  for SSM, because there is no NAT).
- Creating IAM roles without a required **permission boundary** or name
  prefix. Add `permissions_boundary` to `aws_iam_role.bastion` if so.
- Mandatory tags. Set them via `extra_tags` in `terraform.tfvars` (copy
  `terraform.tfvars.example`) and pass the same to `bootstrap`.
- Bedrock / AWS Marketplace permissions (see step 6).

## 2. Create the state bucket (ONE person, once per account)

```powershell
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw backend_hcl | Set-Content -Encoding ascii infra/backend.hcl
# bash/zsh: terraform -chdir=infra/bootstrap output -raw backend_hcl > infra/backend.hcl
```

Share the bucket name with the team. Everyone else creates `infra/backend.hcl`
from `backend.hcl.example` (it's git-ignored).

## 3. Create the stack (ONE person)

```powershell
terraform -chdir=infra init -backend-config=backend.hcl
terraform -chdir=infra plan -out tfplan
terraform -chdir=infra apply tfplan     # RDS takes ~10–15 minutes
```

Everyone else only needs `terraform -chdir=infra init -backend-config=backend.hcl`
so the scripts can read the shared outputs.

## 4. Open the tunnel (everyone, whenever you need the DB)

```powershell
node infra/scripts/db-tunnel.mjs          # localhost:5432 -> RDS; keep this terminal open
node infra/scripts/db-tunnel.mjs 15432    # if 5432 is already used locally
```

Wait a few minutes after the first `apply` for the bastion's SSM agent to
register. `TargetNotConnected` usually just means "not yet".

## 5. Point the app at RDS (everyone)

In a second terminal:

```powershell
node infra/scripts/write-env.mjs          # use the same port as the tunnel, e.g. 15432
npm run db:migrate                        # first time only: creates the schema
```

`write-env.mjs` writes `DATABASE_URL` (password URL-encoded, never printed)
and `AWS_REGION` into `.env.local`, creating it from `.env.example` if
needed. `sslmode=no-verify` is used because the TLS hostname is `localhost`
through the tunnel; the traffic is still encrypted (TLS inside the SSM tunnel).

## 6. Bedrock access (once per account, then everyone)

Most Bedrock models are enabled by default. Your SSO role needs
`bedrock:InvokeModel*` plus the `aws-marketplace:Subscribe`,
`aws-marketplace:Unsubscribe` and `aws-marketplace:ViewSubscriptions`
permissions (see the [model access docs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)).

1. **Anthropic models:** one person opens the model in the Bedrock console
   **Model catalog** (region ap-southeast-2) and submits the one-time
   *use case* form. It can stay "pending" for a while; AWS emails when done.
2. Pick a model. Newer models in Sydney are usually invoked through
   cross-region **inference profiles** (`au.` / `apac.` / `global.` prefixes):

   ```powershell
   aws bedrock list-inference-profiles --region ap-southeast-2 --query "inferenceProfileSummaries[].inferenceProfileId"
   aws bedrock list-foundation-models --region ap-southeast-2 --by-provider anthropic --query "modelSummaries[].modelId"
   ```

   If your company restricts regions, prefer `au.` profiles, which stay in
   Australian regions. `apac.` / `global.` ones may be denied by an SCP.
3. Smoke test:

   ```powershell
   aws bedrock-runtime converse --region ap-southeast-2 --model-id <MODEL_OR_PROFILE_ID> --messages file://infra/scripts/bedrock-smoke-messages.json
   ```

4. Put the ID in `.env.local`: `BEDROCK_MODEL_ID=<MODEL_OR_PROFILE_ID>`.
   The app uses your SSO credentials locally (`AWS_PROFILE` must be set in
   the terminal running `npm run dev`).

## Teardown

```powershell
terraform -chdir=infra destroy
```

To save money between sessions without destroying anything, stop the database:
`aws rds stop-db-instance --db-instance-identifier invoiceiq-dev-postgres`.
AWS restarts it automatically after 7 days. The state bucket (`bootstrap`)
has `prevent_destroy` and costs cents. Remove that lifecycle block first if
you really want it gone.

## Next stages (PLAN-11)

- ECR repos + ECS Fargate services (`web`, `anomaly-engine`) + ALB.
- Private-subnet egress (NAT gateway or VPC endpoints) for ECS tasks.
- Task role with `bedrock:InvokeModel` scoped to the chosen model/profile;
  `DATABASE_URL` assembled from the RDS secret in the task definition.
- Add the ECS task security group to `allowed_security_groups` in `main.tf`.
