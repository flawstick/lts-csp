#!/bin/bash
set -euo pipefail

export $(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)=' /Users/amirashak/endeavour/LTS/apps/web/.env | tr -d '"' | xargs)

AWS_ACCOUNT_ID="988904099875"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="${ECR_REGISTRY}/lts-tax-sync"
TASK_DEFINITION_FAMILY="lts-tax-sync"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)-$(git -C /Users/amirashak/endeavour/LTS rev-parse --short HEAD)"
IMAGE_URI="${ECR_REPO}:${IMAGE_TAG}"
TMP_TASK_DEF="$(mktemp)"
TMP_REGISTER_PAYLOAD="$(mktemp)"

cleanup() {
  rm -f "$TMP_TASK_DEF" "$TMP_REGISTER_PAYLOAD"
}
trap cleanup EXIT

echo "=== LTS Tax Sync Deployment Script ==="
echo "ECR Repo: $ECR_REPO"
echo "AWS Region: $AWS_REGION"
echo "Image Tag: $IMAGE_TAG"
echo ""

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for ECS task definition updates."
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running."
  exit 1
fi

echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "Building Docker image..."
cd /Users/amirashak/endeavour/LTS
docker build --platform linux/amd64 -t lts-tax-sync:latest -f containers/tax-sync/Dockerfile .

echo "Tagging image..."
docker tag lts-tax-sync:latest "$IMAGE_URI"
docker tag lts-tax-sync:latest "${ECR_REPO}:latest"

echo "Pushing images to ECR..."
docker push "$IMAGE_URI"
docker push "${ECR_REPO}:latest"

echo "Fetching current ECS task definition..."
aws ecs describe-task-definition \
  --task-definition "$TASK_DEFINITION_FAMILY" \
  --region "$AWS_REGION" \
  --query 'taskDefinition' > "$TMP_TASK_DEF"

echo "Preparing updated task definition revision..."
jq --arg image "$IMAGE_URI" '
  {
    family,
    taskRoleArn,
    executionRoleArn,
    networkMode,
    containerDefinitions: (.containerDefinitions | map(.image = $image)),
    volumes,
    placementConstraints,
    requiresCompatibilities,
    cpu,
    memory,
    runtimePlatform,
    ephemeralStorage,
    proxyConfiguration,
    pidMode,
    ipcMode
  }
  | del(.. | nulls)
' "$TMP_TASK_DEF" > "$TMP_REGISTER_PAYLOAD"

echo "Registering ECS task definition revision..."
REGISTER_OUTPUT="$(aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json "file://${TMP_REGISTER_PAYLOAD}")"
REVISION="$(echo "$REGISTER_OUTPUT" | jq -r '.taskDefinition.revision')"

echo ""
echo "=== Deployment complete! ==="
echo "Image pushed to: $IMAGE_URI"
echo "Latest tag updated: ${ECR_REPO}:latest"
echo "Registered task definition: ${TASK_DEFINITION_FAMILY}:${REVISION}"
