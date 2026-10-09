// Stage 1 (minimal): private RDS Postgres reachable from laptops through an
// SSM port-forwarding bastion. The app runs locally against it and calls
// Bedrock with each developer's own SSO credentials.
//
// Later stages from docs/PLAN-11-infra-terraform.md (ECR, ECS Fargate, ALB,
// task IAM roles with bedrock:InvokeModel) add modules alongside these.

locals {
  name_prefix = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  vpc_cidr    = var.vpc_cidr
  az_count    = var.az_count
}

module "bastion" {
  source = "./modules/bastion"

  name_prefix   = local.name_prefix
  vpc_id        = module.network.vpc_id
  vpc_cidr      = module.network.vpc_cidr
  subnet_id     = module.network.public_subnet_ids[0]
  instance_type = var.bastion_instance_type
}

module "rds" {
  source = "./modules/rds"

  name_prefix = local.name_prefix
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  allowed_security_groups = {
    bastion = module.bastion.security_group_id
  }

  instance_class      = var.db_instance_class
  engine_version      = var.db_engine_version
  allocated_storage   = var.db_allocated_storage
  db_name             = var.db_name
  username            = var.db_username
  deletion_protection = var.db_deletion_protection
  skip_final_snapshot = var.db_skip_final_snapshot
}
