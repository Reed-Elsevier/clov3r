resource "aws_ecr_repository" "this" {
  for_each             = toset(["invoiceiq-web", "invoiceiq-anomaly-engine"])
  name                 = each.value
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  encryption_configuration { encryption_type = "AES256" }
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after seven days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 7
      }
      action = { type = "expire" }
    }]
  })
}

output "repository_urls" { value = { for name, repository in aws_ecr_repository.this : name => repository.repository_url } }
output "repository_arns" { value = [for repository in aws_ecr_repository.this : repository.arn] }