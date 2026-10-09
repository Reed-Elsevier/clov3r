output "rds_endpoint" { value = module.rds.endpoint }
output "database_secret_arn" { value = module.rds.secret_arn }
output "ecr_repository_urls" { value = module.ecr.repository_urls }
output "alb_dns_name" { value = module.ecs.alb_dns_name }
output "ecs_cluster_name" { value = module.ecs.cluster_name }
output "anomaly_engine_url" { value = module.ecs.anomaly_engine_url }
output "bedrock_model_id" { value = var.bedrock_model_id }
output "aws_region" { value = var.aws_region }
output "database_url_template" {
  description = "Template only. ECS resolves credentials from Secrets Manager at runtime; no password is read by Terraform."
  value       = "postgresql://<username>:<url-encoded-password>@${module.rds.endpoint}/${var.database_name}?sslmode=require"
}
output "web_url" {
  value = "${var.tls_certificate_arn == "" ? "http" : "https"}://${module.ecs.alb_dns_name}"
}