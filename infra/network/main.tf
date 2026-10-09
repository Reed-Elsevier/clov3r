variable "name" { type = string }
variable "vpc_cidr" { type = string }
variable "availability_zones" { type = list(string) }
variable "web_port" { type = number }
variable "anomaly_port" { type = number }
variable "allowed_web_cidrs" { type = list(string) }

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = var.availability_zones[count.index]
  tags              = { Name = "${var.name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index + 2)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.name}-private-${count.index + 1}" }
}

resource "aws_internet_gateway" "this" { vpc_id = aws_vpc.this.id }

resource "aws_eip" "nat" { domain = "vpc" }

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = aws_vpc.this.id
}

resource "aws_security_group" "web" {
  name   = "${var.name}-web"
  vpc_id = aws_vpc.this.id
}

resource "aws_security_group" "anomaly" {
  name   = "${var.name}-anomaly"
  vpc_id = aws_vpc.this.id
}

resource "aws_security_group" "rds" {
  name   = "${var.name}-rds"
  vpc_id = aws_vpc.this.id
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  for_each          = toset(var.allowed_web_cidrs)
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  for_each          = toset(var.allowed_web_cidrs)
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_web" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = var.web_port
  to_port                      = var.web_port
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.web_port
  to_port                      = var.web_port
}

resource "aws_vpc_security_group_ingress_rule" "anomaly" {
  security_group_id            = aws_security_group.anomaly.id
  referenced_security_group_id = aws_security_group.web.id
  ip_protocol                  = "tcp"
  from_port                    = var.anomaly_port
  to_port                      = var.anomaly_port
}

resource "aws_vpc_security_group_ingress_rule" "database" {
  for_each                     = { web = aws_security_group.web.id, anomaly = aws_security_group.anomaly.id }
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "task_https" {
  for_each          = { web = aws_security_group.web.id, anomaly = aws_security_group.anomaly.id }
  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "task_database" {
  for_each                     = { web = aws_security_group.web.id, anomaly = aws_security_group.anomaly.id }
  security_group_id            = each.value
  referenced_security_group_id = aws_security_group.rds.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "web_anomaly" {
  security_group_id            = aws_security_group.web.id
  referenced_security_group_id = aws_security_group.anomaly.id
  ip_protocol                  = "tcp"
  from_port                    = var.anomaly_port
  to_port                      = var.anomaly_port
}

output "vpc_id" { value = aws_vpc.this.id }
output "public_subnet_ids" { value = aws_subnet.public[*].id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
output "alb_security_group_id" { value = aws_security_group.alb.id }
output "web_security_group_id" { value = aws_security_group.web.id }
output "anomaly_security_group_id" { value = aws_security_group.anomaly.id }
output "rds_security_group_id" { value = aws_security_group.rds.id }