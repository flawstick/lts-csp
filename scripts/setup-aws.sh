#!/bin/bash
set -e

# Load env vars
export $(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)=' /Users/amirashak/endeavour/LTS/apps/web/.env | tr -d '"' | xargs)

echo "AWS Region: $AWS_REGION"

# Create ECR repository
echo "Creating ECR repository..."
aws ecr create-repository --repository-name lts-task --region $AWS_REGION 2>/dev/null || echo "ECR repo already exists"

# Get ECR login
echo "Getting ECR login..."
ECR_URI=$(aws ecr describe-repositories --repository-names lts-task --region $AWS_REGION --query 'repositories[0].repositoryUri' --output text)
echo "ECR URI: $ECR_URI"

# Create ECS cluster
echo "Creating ECS cluster..."
aws ecs create-cluster --cluster-name lts-cluster --region $AWS_REGION 2>/dev/null || echo "Cluster already exists"

# Create CloudWatch log group
echo "Creating CloudWatch log group..."
aws logs create-log-group --log-group-name /ecs/lts-task --region $AWS_REGION 2>/dev/null || echo "Log group already exists"

echo "AWS setup complete!"
echo "ECR_URI=$ECR_URI"
