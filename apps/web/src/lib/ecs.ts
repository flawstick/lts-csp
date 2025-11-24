import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
  type RunTaskCommandInput,
} from "@aws-sdk/client-ecs";
import { env } from "@/env";

const client = new ECSClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface LaunchTaskParams {
  taskId: string;
  jobId?: string;
  targetUrl?: string;
  eformsUsername?: string;
  eformsPassword?: string;
}

export async function launchTask(params: LaunchTaskParams) {
  const input: RunTaskCommandInput = {
    cluster: env.ECS_CLUSTER,
    taskDefinition: env.ECS_TASK_DEFINITION,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: env.ECS_SUBNETS.split(","),
        securityGroups: env.ECS_SECURITY_GROUPS.split(","),
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: env.ECS_CONTAINER_NAME,
          environment: [
            { name: "TASK_ID", value: params.taskId },
            { name: "JOB_ID", value: params.jobId || params.taskId },
            { name: "TARGET_URL", value: params.targetUrl || "https://eforms.gov.gg" },
            { name: "STREAM_PORT", value: "8080" },
            { name: "REDIS_URL", value: env.REDIS_URL },
            { name: "DATABASE_URL", value: env.DATABASE_URL },
            ...(params.eformsUsername ? [{ name: "EFORMS_USERNAME", value: params.eformsUsername }] : []),
            ...(params.eformsPassword ? [{ name: "EFORMS_PASSWORD", value: params.eformsPassword }] : []),
          ],
        },
      ],
    },
  };

  const command = new RunTaskCommand(input);
  const response = await client.send(command);

  const task = response.tasks?.[0];
  const taskArn = task?.taskArn;

  // Get the public IP once task is running
  // Note: In production you'd want to poll for this
  let publicIp: string | undefined;

  if (taskArn) {
    // Wait a bit for ENI to be attached
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const describeCommand = new DescribeTasksCommand({
      cluster: env.ECS_CLUSTER,
      tasks: [taskArn],
    });

    const describeResponse = await client.send(describeCommand);
    const attachment = describeResponse.tasks?.[0]?.attachments?.find(
      (a) => a.type === "ElasticNetworkInterface"
    );
    const eniDetail = attachment?.details?.find((d) => d.name === "networkInterfaceId");

    // In a real implementation, you'd query the ENI to get the public IP
    // For now, we'll return what we have
  }

  return {
    taskArn,
    taskId: params.taskId,
    streamUrl: publicIp ? `ws://${publicIp}:8080` : undefined,
  };
}

export async function getTaskStatus(taskArn: string) {
  const command = new DescribeTasksCommand({
    cluster: env.ECS_CLUSTER,
    tasks: [taskArn],
  });

  const response = await client.send(command);
  const task = response.tasks?.[0];

  return {
    status: task?.lastStatus,
    desiredStatus: task?.desiredStatus,
    stoppedReason: task?.stoppedReason,
  };
}

export interface LaunchTaxSyncParams {
  jobId: string;
  eformsCookie: string;
}

export async function launchTaxSync(params: LaunchTaxSyncParams) {
  const taskDef = env.ECS_TAX_SYNC_TASK_DEFINITION || "lts-tax-sync";
  const containerName = env.ECS_TAX_SYNC_CONTAINER_NAME || "lts-tax-sync";

  const input: RunTaskCommandInput = {
    cluster: env.ECS_CLUSTER,
    taskDefinition: taskDef,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: env.ECS_SUBNETS.split(","),
        securityGroups: env.ECS_SECURITY_GROUPS.split(","),
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: containerName,
          environment: [
            { name: "TAX_SYNC_JOB_ID", value: params.jobId },
            { name: "EFORMS_COOKIE", value: params.eformsCookie },
            { name: "DATABASE_URL", value: env.DATABASE_URL },
          ],
        },
      ],
    },
  };

  const command = new RunTaskCommand(input);
  const response = await client.send(command);

  const task = response.tasks?.[0];
  return {
    taskArn: task?.taskArn,
    jobId: params.jobId,
  };
}

// ============================================================================
// Browser Task Runner (uses Browser Use Cloud API)
// ============================================================================

export interface LaunchBrowserTaskParams {
  jobId: string;
  taxReturnId: string;
  taskId: string;
  overrideSaved?: boolean;
}

export async function launchBrowserTask(params: LaunchBrowserTaskParams) {
  const taskDef = env.ECS_BROWSER_TASK_DEFINITION || env.ECS_TASK_DEFINITION;
  const containerName = env.ECS_BROWSER_TASK_CONTAINER_NAME || env.ECS_CONTAINER_NAME;

  const input: RunTaskCommandInput = {
    cluster: env.ECS_CLUSTER,
    taskDefinition: taskDef,
    launchType: "FARGATE",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: env.ECS_SUBNETS.split(","),
        securityGroups: env.ECS_SECURITY_GROUPS.split(","),
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: containerName,
          environment: [
            { name: "JOB_ID", value: params.jobId },
            { name: "TAX_RETURN_ID", value: params.taxReturnId },
            { name: "TASK_ID", value: params.taskId },
            { name: "DATABASE_URL", value: env.DATABASE_URL },
            { name: "REDIS_URL", value: env.REDIS_URL },
            { name: "BROWSER_USE_API_KEY", value: env.BROWSER_USE_API_KEY || "" },
            { name: "USE_UK_PROXY", value: "false" }, // Disabled for now due to 504 timeouts
            { name: "OVERRIDE_SAVED", value: params.overrideSaved ? "true" : "false" },
          ],
        },
      ],
    },
  };

  const command = new RunTaskCommand(input);
  const response = await client.send(command);

  const task = response.tasks?.[0];
  const taskArn = task?.taskArn;
  const ecsTaskId = taskArn?.split("/").pop();
  const logStream = ecsTaskId ? `ecs/${containerName}/${ecsTaskId}` : null;

  return {
    taskArn,
    jobId: params.jobId,
    cloudwatchLogGroup: env.ECS_LOG_GROUP,
    cloudwatchLogStream: logStream,
  };
}
