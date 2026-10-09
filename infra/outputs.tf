output "region" {
  value = var.region
}

output "vpc_id" {
  value = module.network.vpc_id
}

output "db_identifier" {
  description = "Pass to infra/scripts/write-env.mjs if you changed project/environment."
  value       = module.rds.identifier
}

output "db_host" {
  value = module.rds.address
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
  description = "Secrets Manager secret holding {username,password}. infra/scripts/write-env.mjs reads it for you."
  value       = module.rds.master_user_secret_arn
}

output "db_allowed_cidrs" {
  value = var.db_allowed_cidrs
}

output "database_url_template" {
  description = "DATABASE_URL shape for .env.local (password from the secret, CA bundle downloaded by write-env.mjs)."
  value       = "postgres://${module.rds.username}:<password>@${module.rds.address}:${module.rds.port}/${module.rds.db_name}?sslmode=verify-full&sslrootcert=.certs/rds-ca-bundle.pem"
}
