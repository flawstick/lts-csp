#!/bin/bash
set -euo pipefail

ENV_FILE="/Users/amirashak/endeavour/LTS/apps/web/.env"
PROJECT_ROOT="/Users/amirashak/endeavour/LTS"
DOCKERFILE_PATH="containers/task/Dockerfile"

export $(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION|ECS_BROWSER_TASK_DEFINITION|ECS_TASK_DEFINITION)=' "$ENV_FILE" | tr -d '"' | xargs)

TASK_DEFINITION_REF="${ECS_BROWSER_TASK_DEFINITION:-${ECS_TASK_DEFINITION:-lts-task}}"
IMAGE_TAG="$(date +%Y%m%d%H%M%S)-$(git -C "$PROJECT_ROOT" rev-parse --short HEAD)"
TMP_TASK_DEF="$(mktemp)"
TMP_REGISTER_PAYLOAD="$(mktemp)"

cleanup() {
  rm -f "$TMP_TASK_DEF" "$TMP_REGISTER_PAYLOAD"
}
trap cleanup EXIT

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for ECS task definition updates."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "=== LTS Browser Task Deployment Script ==="
echo "Task Definition Ref: $TASK_DEFINITION_REF"
echo "AWS Region: $AWS_REGION"
echo "Image Tag: $IMAGE_TAG"
echo ""

echo "Fetching current ECS task definition..."
aws ecs describe-task-definition \
  --task-definition "$TASK_DEFINITION_REF" \
  --region "$AWS_REGION" \
  --query 'taskDefinition' >"$TMP_TASK_DEF"

TASK_DEFINITION_FAMILY="$(jq -r '.family' "$TMP_TASK_DEF")"
CURRENT_IMAGE="$(jq -r '.containerDefinitions[0].image' "$TMP_TASK_DEF")"
CURRENT_IMAGE_BASE="${CURRENT_IMAGE%@*}"
ECR_REPO="${CURRENT_IMAGE_BASE%:*}"
ECR_REGISTRY="${ECR_REPO%/*}"
IMAGE_URI="${ECR_REPO}:${IMAGE_TAG}"

echo "Resolved task family: $TASK_DEFINITION_FAMILY"
echo "Resolved ECR repo: $ECR_REPO"
echo ""

echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "Building Docker image..."
cd "$PROJECT_ROOT"
docker build --platform linux/amd64 -t lts-task:latest -f "$DOCKERFILE_PATH" .

echo "Tagging image..."
docker tag lts-task:latest "$IMAGE_URI"
docker tag lts-task:latest "${ECR_REPO}:latest"

echo "Pushing images to ECR..."
docker push "$IMAGE_URI"
docker push "${ECR_REPO}:latest"

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
' "$TMP_TASK_DEF" >"$TMP_REGISTER_PAYLOAD"

echo "Registering ECS task definition revision..."
REGISTER_OUTPUT="$(aws ecs register-task-definition --region "$AWS_REGION" --cli-input-json "file://${TMP_REGISTER_PAYLOAD}")"
REVISION="$(echo "$REGISTER_OUTPUT" | jq -r '.taskDefinition.revision')"

echo ""
echo "=== Deployment complete! ==="
echo "Image pushed to: $IMAGE_URI"
echo "Latest tag updated: ${ECR_REPO}:latest"
echo "Registered task definition: ${TASK_DEFINITION_FAMILY}:${REVISION}"
