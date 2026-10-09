variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_id" { type = string }
variable "database_name" { type = string }
variable "instance_class" { type = string }
variable "deletion_protection" { type = bool }

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-postgres16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                  = var.name
  engine                      = "postgres"
  engine_version              = "16"
  instance_class              = var.instance_class
  allocated_storage           = 20
  max_allocated_storage       = 100
  storage_type                = "gp3"
  storage_encrypted           = true
  db_name                     = var.database_name
  username                    = "invoiceiq_admin"
  manage_master_user_password = true
  db_subnet_group_name        = aws_db_subnet_group.this.name
  parameter_group_name        = aws_db_parameter_group.this.name
  vpc_security_group_ids      = [var.security_group_id]
  publicly_accessible         = false
  multi_az                    = false
  backup_retention_period     = 7
  auto_minor_version_upgrade  = true
  deletion_protection         = var.deletion_protection
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.name}-final"
  copy_tags_to_snapshot       = true
}

output "endpoint" { value = aws_db_instance.this.endpoint }
output "address" { value = aws_db_instance.this.address }
output "database_name" { value = aws_db_instance.this.db_name }
output "secret_arn" { value = aws_db_instance.this.master_user_secret[0].secret_arn }