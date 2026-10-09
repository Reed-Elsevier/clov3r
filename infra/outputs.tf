output "region" {
  value = var.region
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "bastion_instance_id" {
  value = module.bastion.instance_id
}

output "db_host" {
  description = "Private RDS endpoint (reachable only via the bastion tunnel)."
  value       = module.rds.address
}

output "db_port" {
  value = module.rds.port
}

output "db_name" {
  value = module.rds.db_name
}

output "db_username" {
  value = module.rds.username
}

output "db_master_secret_arn" {
  description = "Secrets Manager secret holding {username,password}; read it with infra/scripts/write-env.mjs."
  value       = module.rds.master_user_secret_arn
}

output "db_tunnel_command" {
  description = "Opens localhost:5432 -> RDS. Prefer `node infra/scripts/db-tunnel.mjs`."
  value       = "aws ssm start-session --region ${var.region} --target ${module.bastion.instance_id} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host=${module.rds.address},portNumber=${module.rds.port},localPortNumber=5432"
}

output "database_url_template" {
  description = "DATABASE_URL shape for .env.local while the tunnel is open (password from the secret)."
  value       = "postgres://${module.rds.username}:<password>@localhost:5432/${module.rds.db_name}?sslmode=no-verify"
}
