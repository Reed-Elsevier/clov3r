variable "name" { type = string }
variable "database_secret_arn" { type = string }
variable "ecr_repository_arns" { type = list(string) }
variable "bedrock_model_arns" { type = list(string) }
variable "log_group_arns" { type = list(string) }

data "aws_caller_identity" "current" {}

locals {
  trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
    }]
  })
}

resource "aws_iam_role" "execution" {
  for_each           = toset(["web", "anomaly"])
  name               = "${var.name}-${each.value}-execution"
  assume_role_policy = local.trust_policy
}

resource "aws_iam_role_policy" "execution" {
  for_each = aws_iam_role.execution
  name     = "container-startup"
  role     = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = var.ecr_repository_arns
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [for arn in var.log_group_arns : "${arn}:*"]
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.database_secret_arn]
      }
    ]
  })
}

resource "aws_iam_role" "task" {
  for_each           = toset(["web", "anomaly"])
  name               = "${var.name}-${each.value}-task"
  assume_role_policy = local.trust_policy
}

resource "aws_iam_role_policy" "bedrock" {
  name = "invoke-selected-model"
  role = aws_iam_role.task["web"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["bedrock:InvokeModel"]
      Resource = var.bedrock_model_arns
    }]
  })
}

output "web_execution_role_arn" {
  value      = aws_iam_role.execution["web"].arn
  depends_on = [aws_iam_role_policy.execution]
}
output "anomaly_execution_role_arn" {
  value      = aws_iam_role.execution["anomaly"].arn
  depends_on = [aws_iam_role_policy.execution]
}
output "web_task_role_arn" {
  value      = aws_iam_role.task["web"].arn
  depends_on = [aws_iam_role_policy.bedrock]
}
output "anomaly_task_role_arn" { value = aws_iam_role.task["anomaly"].arn }