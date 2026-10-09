variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,15}$", var.environment))
    error_message = "Use a short lowercase environment name."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
  validation {
    condition     = can(cidrsubnet(var.vpc_cidr, 4, 3))
    error_message = "Provide an IPv4 CIDR large enough for four subnets."
  }
}

variable "allowed_web_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
  validation {
    condition     = length(var.allowed_web_cidrs) > 0 && alltrue([for cidr in var.allowed_web_cidrs : can(cidrnetmask(cidr))])
    error_message = "Provide at least one valid IPv4 client CIDR."
  }
}

variable "database_name" {
  type    = string
  default = "invoiceiq"
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,62}$", var.database_name))
    error_message = "Use an alphanumeric PostgreSQL database name beginning with a letter."
  }
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "bedrock_model_id" {
  description = "Exact Bedrock model or inference profile ID used by the application. Confirm availability in the chosen region."
  type        = string
  validation {
    condition     = length(trimspace(var.bedrock_model_id)) > 0 && length(regexall("\\*", var.bedrock_model_id)) == 0
    error_message = "Choose an explicit Bedrock model or inference profile ID."
  }
}

variable "bedrock_model_arns" {
  description = "Exact invocation resource ARNs. For cross-region inference include the profile and each destination foundation-model ARN. No wildcards."
  type        = list(string)
  validation {
    condition     = length(var.bedrock_model_arns) > 0 && alltrue([for arn in var.bedrock_model_arns : can(regex("^arn:aws(-[a-z]+)?:bedrock:[a-z0-9-]+:[0-9]*:(foundation-model|inference-profile|application-inference-profile)/[^*]+$", arn))])
    error_message = "Provide explicit Bedrock foundation-model or inference-profile ARNs without wildcards."
  }
}

variable "web_image_tag" {
  type    = string
  default = "initial"
}

variable "anomaly_image_tag" {
  type    = string
  default = "initial"
}

variable "web_desired_count" {
  type    = number
  default = 0
  validation {
    condition     = var.web_desired_count >= 0 && floor(var.web_desired_count) == var.web_desired_count
    error_message = "Task count must be a nonnegative integer."
  }
}

variable "anomaly_desired_count" {
  type    = number
  default = 0
  validation {
    condition     = var.anomaly_desired_count >= 0 && floor(var.anomaly_desired_count) == var.anomaly_desired_count
    error_message = "Task count must be a nonnegative integer."
  }
}

variable "web_health_check_path" {
  type    = string
  default = "/"
}

variable "anomaly_health_check_path" {
  type    = string
  default = "/health"
}

variable "web_start_command" {
  description = "Command executed by the secret-aware Node launcher. Set to [node, server.js] for a Next.js standalone image."
  type        = list(string)
  default     = ["node", "node_modules/next/dist/bin/next", "start"]
  validation {
    condition     = length(var.web_start_command) > 0
    error_message = "Provide a nonempty production web command."
  }
}

variable "tls_certificate_arn" {
  description = "Optional ACM certificate in this region. If provided, enable HTTPS and redirect HTTP. Empty is dev-only HTTP."
  type        = string
  default     = ""
}

variable "anomaly_start_command" {
  description = "FastAPI production command; adjust the module name to match the service image."
  type        = list(string)
  default     = ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
  validation {
    condition     = length(var.anomaly_start_command) > 0
    error_message = "Provide a nonempty anomaly-engine start command."
  }
}