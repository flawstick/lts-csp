#!/bin/bash
set -euo pipefail

ENV_FILE="/Users/amirashak/endeavour/LTS/apps/web/.env"
PROJECT_ROOT="/Users/amirashak/endeavour/LTS"
DOCKERFILE_PATH="containers/task/Dockerfile"

set -a
source "$ENV_FILE"
set +a

TASK_DEFINITION_REF="${ECS_BROWSER_TASK_DEFINITION:-${ECS_TASK_DEFINITION:-lts-task}}"
SERVICE_NAME="${ECS_BROWSER_TASK_SERVICE:-lts-browser-workers}"
DESIRED_COUNT="${ECS_BROWSER_TASK_DESIRED_COUNT:-2}"
BROWSER_STARTUP_TIMEOUT_MS="${BROWSER_STARTUP_TIMEOUT_MS:-45000}"
BROWSER_WORKER_POLL_INTERVAL_MS="${BROWSER_WORKER_POLL_INTERVAL_MS:-1500}"
BROWSER_WORKER_HEARTBEAT_INTERVAL_MS="${BROWSER_WORKER_HEARTBEAT_INTERVAL_MS:-10000}"
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
echo "Browser Worker Service: $SERVICE_NAME"
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
jq \
  --arg image "$IMAGE_URI" \
  --arg startupTimeout "$BROWSER_STARTUP_TIMEOUT_MS" \
  --arg pollInterval "$BROWSER_WORKER_POLL_INTERVAL_MS" \
  --arg heartbeatInterval "$BROWSER_WORKER_HEARTBEAT_INTERVAL_MS" \
  --arg logGroup "${ECS_LOG_GROUP:-/ecs/lts-task}" \
  --arg databaseUrl "${DATABASE_URL:-}" \
  --arg redisUrl "${REDIS_URL:-}" \
  --arg browserUseApiKey "${BROWSER_USE_API_KEY:-}" \
  --arg blobReadWriteToken "${BLOB_READ_WRITE_TOKEN:-}" '
  def upsert_env($name; $value):
    ((. // []) | map(select(.name != $name))) + [{ name: $name, value: $value }];
  def delete_env($name):
    ((. // []) | map(select(.name != $name)));

  {
    family,
    taskRoleArn,
    executionRoleArn,
    networkMode,
    containerDefinitions: (
      .containerDefinitions
      | map(
          . as $container
          | .image = $image
          | del(.portMappings)
          | .environment = (
              $container.environment
              | delete_env("STREAM_PORT")
              | upsert_env("WORKER_MODE"; "service")
              | upsert_env("BROWSER_STARTUP_TIMEOUT_MS"; $startupTimeout)
              | upsert_env("BROWSER_JOB_POLL_INTERVAL_MS"; $pollInterval)
              | upsert_env("BROWSER_JOB_HEARTBEAT_INTERVAL_MS"; $heartbeatInterval)
              | upsert_env("CLOUDWATCH_LOG_GROUP"; $logGroup)
              | upsert_env("WORKER_CONTAINER_NAME"; $container.name)
              | upsert_env("DATABASE_URL"; $databaseUrl)
              | upsert_env("REDIS_URL"; $redisUrl)
              | upsert_env("BROWSER_USE_API_KEY"; $browserUseApiKey)
              | upsert_env("BLOB_READ_WRITE_TOKEN"; $blobReadWriteToken)
            )
        )
    ),
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
TASK_DEFINITION_ARN="$(echo "$REGISTER_OUTPUT" | jq -r '.taskDefinition.taskDefinitionArn')"

echo "Ensuring ECS browser worker service is running..."
SERVICE_STATUS="$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$SERVICE_NAME" --region "$AWS_REGION" --query 'services[0].status' --output text 2>/dev/null || true)"

if [ "$SERVICE_STATUS" = "ACTIVE" ] || [ "$SERVICE_STATUS" = "DRAINING" ]; then
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$SERVICE_NAME" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --desired-count "$DESIRED_COUNT" \
    --force-new-deployment \
    --region "$AWS_REGION" >/dev/null
else
  aws ecs create-service \
    --cluster "$ECS_CLUSTER" \
    --service-name "$SERVICE_NAME" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --desired-count "$DESIRED_COUNT" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$(echo "$ECS_SUBNETS" | tr ',' '\n' | paste -sd, -)],securityGroups=[$(echo "$ECS_SECURITY_GROUPS" | tr ',' '\n' | paste -sd, -)],assignPublicIp=ENABLED}" \
    --region "$AWS_REGION" >/dev/null
fi

echo ""
echo "=== Deployment complete! ==="
echo "Image pushed to: $IMAGE_URI"
echo "Latest tag updated: ${ECR_REPO}:latest"
echo "Registered task definition: ${TASK_DEFINITION_FAMILY}:${REVISION}"
echo "Browser worker service ensured: ${SERVICE_NAME} (${DESIRED_COUNT} tasks)"
