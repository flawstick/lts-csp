#!/bin/bash
set -e

# Load env vars
export $(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)=' /Users/amirashak/endeavour/LTS/apps/web/.env | tr -d '"' | xargs)

ECR_REPO="988904099875.dkr.ecr.eu-west-2.amazonaws.com/lts-task"
TASK_DIR="/Users/amirashak/endeavour/LTS/containers/task"

echo "=== LTS Task Deployment Script ==="
echo "ECR Repo: $ECR_REPO"
echo "AWS Region: $AWS_REGION"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin 988904099875.dkr.ecr.eu-west-2.amazonaws.com

# Build the image (from project root with -f flag)
echo "Building Docker image..."
cd /Users/amirashak/endeavour/LTS
docker build --platform linux/amd64 -t lts-task:latest -f containers/task/Dockerfile .

# Tag for ECR
echo "Tagging image..."
docker tag lts-task:latest $ECR_REPO:latest

# Push to ECR
echo "Pushing to ECR..."
docker push $ECR_REPO:latest

echo ""
echo "=== Deployment complete! ==="
echo "Image pushed to: $ECR_REPO:latest"
echo ""
echo "You can now run tasks via the API:"
echo "  curl -X POST http://localhost:3000/api/debug/launch-task -H 'Content-Type: application/json' -d '{\"launchEcs\": true}'"
