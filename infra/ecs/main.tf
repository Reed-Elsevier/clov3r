variable "name" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
variable "web_security_group_id" { type = string }
variable "anomaly_security_group_id" { type = string }
variable "web_execution_role_arn" { type = string }
variable "anomaly_execution_role_arn" { type = string }
variable "web_task_role_arn" { type = string }
variable "anomaly_task_role_arn" { type = string }
variable "database_secret_arn" { type = string }
variable "database_host" { type = string }
variable "database_name" { type = string }
variable "bedrock_model_id" { type = string }
variable "web_image" { type = string }
variable "anomaly_image" { type = string }
variable "web_port" { type = number }
variable "anomaly_port" { type = number }
variable "web_desired_count" { type = number }
variable "anomaly_desired_count" { type = number }
variable "web_health_check_path" { type = string }
variable "anomaly_health_check_path" { type = string }
variable "web_start_command" { type = list(string) }
variable "anomaly_start_command" { type = list(string) }
variable "tls_certificate_arn" { type = string }

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "this" {
  for_each          = toset(["web", "anomaly"])
  name              = "/ecs/${var.name}/${each.value}"
  retention_in_days = 14
}

resource "aws_service_discovery_private_dns_namespace" "this" {
  name = "${var.name}.internal"
  vpc  = var.vpc_id
}

resource "aws_service_discovery_service" "anomaly" {
  name = "anomaly-engine"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"
    dns_records {
      ttl  = 10
      type = "A"
    }
  }
  health_check_custom_config {}
}

resource "aws_ssm_parameter" "anomaly_url" {
  name  = "/${var.name}/ANOMALY_ENGINE_URL"
  type  = "String"
  value = "http://anomaly-engine.${aws_service_discovery_private_dns_namespace.this.name}:${var.anomaly_port}"
}

resource "aws_ssm_parameter" "model_id" {
  name  = "/${var.name}/BEDROCK_MODEL_ID"
  type  = "String"
  value = var.bedrock_model_id
}

locals {
  shared_environment = [
    { name = "AWS_REGION", value = var.region },
    { name = "DB_HOST", value = var.database_host },
    { name = "DB_NAME", value = var.database_name },
    { name = "PGSSLMODE", value = "require" },
    { name = "ANOMALY_ENGINE_URL", value = nonsensitive(aws_ssm_parameter.anomaly_url.value) },
    { name = "BEDROCK_MODEL_ID", value = nonsensitive(aws_ssm_parameter.model_id.value) }
  ]
  containers = {
    web = {
      name         = "web"
      image        = var.web_image
      essential    = true
      portMappings = [{ containerPort = var.web_port, protocol = "tcp" }]
      entryPoint   = ["node", "-e", file("${path.module}/web-entrypoint.cjs"), "--"]
      command      = var.web_start_command
      environment = concat(local.shared_environment, [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.web_port) },
        { name = "HOSTNAME", value = "0.0.0.0" }
      ])
      secrets = [{ name = "DB_CREDENTIALS", valueFrom = var.database_secret_arn }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this["web"].name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
    anomaly = {
      name         = "anomaly"
      image        = var.anomaly_image
      essential    = true
      portMappings = [{ containerPort = var.anomaly_port, protocol = "tcp" }]
      entryPoint   = ["python", "-c", file("${path.module}/anomaly-entrypoint.py")]
      command      = var.anomaly_start_command
      environment  = concat(local.shared_environment, [{ name = "PORT", value = tostring(var.anomaly_port) }])
      secrets      = [{ name = "DB_CREDENTIALS", valueFrom = var.database_secret_arn }]
      healthCheck = {
        command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${var.anomaly_port}${var.anomaly_health_check_path}', timeout=3)"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this["anomaly"].name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  }
}

resource "aws_ecs_task_definition" "this" {
  for_each                 = toset(["web", "anomaly"])
  family                   = "${var.name}-${each.value}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = each.value == "web" ? var.web_execution_role_arn : var.anomaly_execution_role_arn
  task_role_arn            = each.value == "web" ? var.web_task_role_arn : var.anomaly_task_role_arn
  container_definitions    = jsonencode([local.containers[each.value]])
  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }
}

resource "aws_lb" "this" {
  name                       = var.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.alb_security_group_id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = var.web_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    path    = var.web_health_check_path
    matcher = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = var.tls_certificate_arn == "" ? "forward" : "redirect"
    target_group_arn = var.tls_certificate_arn == "" ? aws_lb_target_group.web.arn : null
    dynamic "redirect" {
      for_each = var.tls_certificate_arn == "" ? [] : [1]
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.tls_certificate_arn == "" ? 0 : 1
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.tls_certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_ecs_service" "web" {
  name                              = "web"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.this["web"].arn
  desired_count                     = var.web_desired_count
  launch_type                       = "FARGATE"
  platform_version                  = "1.4.0"
  health_check_grace_period_seconds = 60
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.web_security_group_id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = var.web_port
  }
  depends_on = [aws_lb_listener.http, aws_lb_listener.https]
}

resource "aws_ecs_service" "anomaly" {
  name             = "anomaly-engine"
  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.this["anomaly"].arn
  desired_count    = var.anomaly_desired_count
  launch_type      = "FARGATE"
  platform_version = "1.4.0"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.anomaly_security_group_id]
    assign_public_ip = false
  }
  service_registries { registry_arn = aws_service_discovery_service.anomaly.arn }
}

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "anomaly_engine_url" { value = nonsensitive(aws_ssm_parameter.anomaly_url.value) }
output "log_group_arns" { value = [for group in aws_cloudwatch_log_group.this : group.arn] }
output "cluster_name" { value = aws_ecs_cluster.this.name }