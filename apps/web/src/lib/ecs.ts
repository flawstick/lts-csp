import {
  ECSClient,
  RunTaskCommand,
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

export interface LaunchJobParams {
  jobId: string;
  type: "tax-submission";
  data: {
    assignmentId: string;
    credentials: {
      username: string;
      password: string;
    };
  };
}

export async function launchEcsJob(params: LaunchJobParams) {
  const jobPayload = JSON.stringify(params);

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
            { name: "JOB_PAYLOAD", value: jobPayload },
            { name: "REDIS_URL", value: env.REDIS_URL },
            { name: "DATABASE_URL", value: env.DATABASE_URL },
          ],
        },
      ],
    },
  };

  const command = new RunTaskCommand(input);
  const response = await client.send(command);

  return {
    taskArn: response.tasks?.[0]?.taskArn,
    jobId: params.jobId,
  };
}
