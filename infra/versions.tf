terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial config; values come from backend.hcl (see backend.hcl.example and
  # infra/README.md). `use_lockfile` gives S3-native state locking.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = merge(
      {
        Project     = var.project
        Environment = var.environment
        ManagedBy   = "terraform"
      },
      var.extra_tags,
    )
  }
}
