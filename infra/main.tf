provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "InvoiceIQ"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_availability_zones" "available" { state = "available" }

locals {
  name         = "invoiceiq-${var.environment}"
  web_port     = 3000
  anomaly_port = 8000
}

module "network" {
  source             = "./network"
  name               = local.name
  vpc_cidr           = var.vpc_cidr
  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)
  web_port           = local.web_port
  anomaly_port       = local.anomaly_port
  allowed_web_cidrs  = var.allowed_web_cidrs
}

module "rds" {
  source              = "./rds"
  name                = local.name
  subnet_ids          = module.network.private_subnet_ids
  security_group_id   = module.network.rds_security_group_id
  database_name       = var.database_name
  instance_class      = var.db_instance_class
  deletion_protection = var.deletion_protection
}

module "ecr" { source = "./ecr" }

module "iam" {
  source              = "./iam"
  name                = local.name
  database_secret_arn = module.rds.secret_arn
  ecr_repository_arns = module.ecr.repository_arns
  bedrock_model_arns  = var.bedrock_model_arns
  log_group_arns      = module.ecs.log_group_arns
}

module "ecs" {
  source                     = "./ecs"
  name                       = local.name
  region                     = var.aws_region
  vpc_id                     = module.network.vpc_id
  public_subnet_ids          = module.network.public_subnet_ids
  private_subnet_ids         = module.network.private_subnet_ids
  alb_security_group_id      = module.network.alb_security_group_id
  web_security_group_id      = module.network.web_security_group_id
  anomaly_security_group_id  = module.network.anomaly_security_group_id
  web_execution_role_arn     = module.iam.web_execution_role_arn
  anomaly_execution_role_arn = module.iam.anomaly_execution_role_arn
  web_task_role_arn          = module.iam.web_task_role_arn
  anomaly_task_role_arn      = module.iam.anomaly_task_role_arn
  database_secret_arn        = module.rds.secret_arn
  database_host              = module.rds.address
  database_name              = module.rds.database_name
  bedrock_model_id           = var.bedrock_model_id
  web_image                  = "${module.ecr.repository_urls["invoiceiq-web"]}:${var.web_image_tag}"
  anomaly_image              = "${module.ecr.repository_urls["invoiceiq-anomaly-engine"]}:${var.anomaly_image_tag}"
  web_port                   = local.web_port
  anomaly_port               = local.anomaly_port
  web_desired_count          = var.web_desired_count
  anomaly_desired_count      = var.anomaly_desired_count
  web_health_check_path      = var.web_health_check_path
  anomaly_health_check_path  = var.anomaly_health_check_path
  web_start_command          = var.web_start_command
  anomaly_start_command      = var.anomaly_start_command
  tls_certificate_arn        = var.tls_certificate_arn
}