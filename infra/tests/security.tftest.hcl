mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b"] }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      address  = "db.example.internal"
      endpoint = "db.example.internal:5432"
      master_user_secret = [{
        secret_arn    = "arn:aws:secretsmanager:us-east-1:123456789012:secret:invoiceiq-test"
        secret_status = "active"
        kms_key_id    = "arn:aws:kms:us-east-1:123456789012:key/test"
      }]
    }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/test" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/ecs/test" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = {
      arn            = "arn:aws:ecr:us-east-1:123456789012:repository/test"
      repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/test"
    }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = {
      arn = "arn:aws:ecs:us-east-1:123456789012:cluster/test"
      id  = "arn:aws:ecs:us-east-1:123456789012:cluster/test"
    }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/test:1" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test/1111111111111111" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/test/1111111111111111" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:us-east-1:123456789012:service/srv-test" }
  }
}

variables {
  bedrock_model_id   = "amazon.nova-micro-v1:0"
  bedrock_model_arns = ["arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0"]
}

run "root_wiring" {
  command = apply
  assert {
    condition     = output.anomaly_engine_url == "http://anomaly-engine.invoiceiq-dev.internal:8000"
    error_message = "Web must use the private service discovery URL."
  }
  assert {
    condition     = output.database_url_template == "postgresql://<username>:<url-encoded-password>@db.example.internal:5432/invoiceiq?sslmode=require"
    error_message = "Database output must be a password-free TLS connection template."
  }
  assert {
    condition     = output.bedrock_model_id == var.bedrock_model_id && output.aws_region == "us-east-1"
    error_message = "Deployment outputs must preserve the chosen Bedrock configuration."
  }
}

run "private_network" {
  command = plan
  module { source = "./network" }
  variables {
    name               = "invoiceiq-test"
    vpc_cidr           = "10.42.0.0/16"
    availability_zones = ["us-east-1a", "us-east-1b"]
    web_port           = 3000
    anomaly_port       = 8000
    allowed_web_cidrs  = ["203.0.113.0/24"]
  }
  assert {
    condition     = length(aws_subnet.private) == 2 && alltrue([for subnet in aws_subnet.private : !subnet.map_public_ip_on_launch])
    error_message = "Database and task subnets must not assign public addresses."
  }
  assert {
    condition     = alltrue([for rule in aws_vpc_security_group_ingress_rule.database : rule.cidr_ipv4 == null && rule.from_port == 5432 && rule.to_port == 5432])
    error_message = "RDS ingress must be security-group-only on PostgreSQL port 5432."
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.anomaly.cidr_ipv4 == null && aws_vpc_security_group_ingress_rule.anomaly.from_port == 8000
    error_message = "Anomaly engine must have only internal security-group ingress."
  }
}

run "managed_database_credentials" {
  command = plan
  module { source = "./rds" }
  variables {
    name                = "invoiceiq-test"
    subnet_ids          = ["subnet-12345678", "subnet-87654321"]
    security_group_id   = "sg-12345678"
    database_name       = "invoiceiq"
    instance_class      = "db.t4g.micro"
    deletion_protection = true
  }
  assert {
    condition     = aws_db_instance.this.manage_master_user_password && aws_db_instance.this.password == null
    error_message = "AWS must generate and manage the password outside Terraform state."
  }
  assert {
    condition     = aws_db_instance.this.storage_encrypted && !aws_db_instance.this.publicly_accessible && !aws_db_instance.this.skip_final_snapshot
    error_message = "RDS must be private, encrypted, and retain a final snapshot."
  }
  assert {
    condition     = one(aws_db_parameter_group.this.parameter).value == "1"
    error_message = "Postgres must enforce SSL connections."
  }
}

run "scoped_bedrock_iam" {
  command = plan
  module { source = "./iam" }
  variables {
    name                = "invoiceiq-test"
    database_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:invoiceiq-test"
    ecr_repository_arns = ["arn:aws:ecr:us-east-1:123456789012:repository/invoiceiq-web"]
    log_group_arns      = ["arn:aws:logs:us-east-1:123456789012:log-group:/ecs/test"]
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.bedrock.policy).Statement[0].Action[0] == "bedrock:InvokeModel" && length(jsondecode(aws_iam_role_policy.bedrock.policy).Statement[0].Action) == 1
    error_message = "Web task must only receive the required Bedrock invocation action."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.bedrock.policy).Statement[0].Resource[0] == var.bedrock_model_arns[0] && length(jsondecode(aws_iam_role_policy.bedrock.policy).Statement[0].Resource) == 1
    error_message = "Bedrock access must be scoped to the selected model, not wildcard resources."
  }
}

run "private_ecs_runtime" {
  command = plan
  module { source = "./ecs" }
  variables {
    name                       = "invoiceiq-test"
    region                     = "us-east-1"
    vpc_id                     = "vpc-12345678"
    public_subnet_ids          = ["subnet-12345678", "subnet-87654321"]
    private_subnet_ids         = ["subnet-11111111", "subnet-22222222"]
    alb_security_group_id      = "sg-12345678"
    web_security_group_id      = "sg-11111111"
    anomaly_security_group_id  = "sg-22222222"
    web_execution_role_arn     = "arn:aws:iam::123456789012:role/web-execution"
    anomaly_execution_role_arn = "arn:aws:iam::123456789012:role/anomaly-execution"
    web_task_role_arn          = "arn:aws:iam::123456789012:role/web"
    anomaly_task_role_arn      = "arn:aws:iam::123456789012:role/anomaly"
    database_secret_arn        = "arn:aws:secretsmanager:us-east-1:123456789012:secret:invoiceiq-test"
    database_host              = "db.example.internal"
    database_name              = "invoiceiq"
    web_image                  = "example/web:initial"
    anomaly_image              = "example/anomaly:initial"
    web_port                   = 3000
    anomaly_port               = 8000
    web_desired_count          = 0
    anomaly_desired_count      = 0
    web_health_check_path      = "/"
    anomaly_health_check_path  = "/health"
    web_start_command          = ["node", "server.js"]
    anomaly_start_command      = ["python", "-m", "uvicorn", "main:app"]
    tls_certificate_arn        = "arn:aws:acm:us-east-1:123456789012:certificate/11111111-1111-1111-1111-111111111111"
  }
  assert {
    condition     = !one(aws_ecs_service.web.network_configuration).assign_public_ip && !one(aws_ecs_service.anomaly.network_configuration).assign_public_ip
    error_message = "Neither Fargate service may have a public IP."
  }
  assert {
    condition     = alltrue([for task in aws_ecs_task_definition.this : jsondecode(task.container_definitions)[0].secrets[0].valueFrom == var.database_secret_arn && !contains([for setting in jsondecode(task.container_definitions)[0].environment : setting.name], "DATABASE_URL")])
    error_message = "Inject secret ARNs, never database passwords or URLs, in task definitions."
  }
  assert {
    condition     = one(aws_lb_listener.http.default_action).type == "redirect" && length(aws_lb_listener.https) == 1
    error_message = "A supplied certificate must enable HTTPS and redirect HTTP."
  }
  assert {
    condition     = aws_ecs_service.web.desired_count == 0 && aws_ecs_service.anomaly.desired_count == 0
    error_message = "Bootstrap must permit repository provisioning before images are pushed."
  }
}

run "reject_wildcard_bedrock_access" {
  command = plan
  variables { bedrock_model_arns = ["arn:aws:bedrock:us-east-1::foundation-model/*"] }
  expect_failures = [var.bedrock_model_arns]
}