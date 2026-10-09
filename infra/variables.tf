variable "region" {
  description = "AWS region for all resources (and Bedrock calls)."
  type        = string
  default     = "ap-southeast-2"
}

variable "project" {
  description = "Short project name used in resource names."
  type        = string
  default     = "invoiceiq"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "extra_tags" {
  description = "Additional tags required by company policy (e.g. Owner, CostCenter)."
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2
}

variable "db_allowed_cidrs" {
  description = <<-EOT
    Public IPs allowed to connect to Postgres, keyed by a short name, e.g.
    { sotelor = "58.69.2.186/32" }. Each teammate adds their own (find it at
    https://checkip.amazonaws.com). Empty = database not publicly reachable.
  EOT
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for cidr in values(var.db_allowed_cidrs) : can(cidrhost(cidr, 0)) && cidr != "0.0.0.0/0"])
    error_message = "Each db_allowed_cidrs value must be a valid IPv4 CIDR (e.g. 1.2.3.4/32), and 0.0.0.0/0 is not allowed."
  }
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "Postgres major version."
  type        = string
  default     = "17"
}

variable "db_allocated_storage" {
  description = "Initial storage in GiB (autoscales up to 5x)."
  type        = number
  default     = 20
}

variable "db_name" {
  type    = string
  default = "invoiceiq"
}

variable "db_username" {
  type    = string
  default = "invoiceiq_admin"
}

variable "db_deletion_protection" {
  description = "Enable for anything long-lived. Off by default for the hackathon dev stack."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "The dataset can be reloaded from CSV, so no final snapshot by default."
  type        = bool
  default     = true
}
