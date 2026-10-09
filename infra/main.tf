// Stage 1 (minimal): RDS Postgres that team laptops connect to directly
// (allow-listed public IPs only, TLS enforced). The Next.js app runs locally
// against it and calls Bedrock with each developer's own SSO credentials.
// Apply this stack from AWS CloudShell; see infra/README.md.
//
// Later stages from docs/PLAN-11-infra-terraform.md (ECR, ECS Fargate, ALB,
// task IAM roles with bedrock:InvokeModel) add modules alongside these and
// pass the ECS task security group via `allowed_security_groups`.

locals {
  name_prefix = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

module "rds" {
  source = "./modules/rds"

  name_prefix = local.name_prefix
  vpc_id      = module.network.vpc_id
  # Public subnets so laptops can connect; the instance only gets a public IP
  # (and only allow-listed CIDRs get through) when db_allowed_cidrs is set.
  subnet_ids    = module.network.public_subnet_ids
  allowed_cidrs = var.db_allowed_cidrs

  instance_class      = var.db_instance_class
  engine_version      = var.db_engine_version
  allocated_storage   = var.db_allocated_storage
  db_name             = var.db_name
  username            = var.db_username
  deletion_protection = var.db_deletion_protection
  skip_final_snapshot = var.db_skip_final_snapshot
}
