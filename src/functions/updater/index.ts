import { EC2Client, DescribeNetworkInterfacesCommand } from "@aws-sdk/client-ec2";
import { ECSClient, DescribeTasksCommand, Attachment } from "@aws-sdk/client-ecs";
import { Route53Client, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
import { EventBridgeEvent } from 'aws-lambda';

const route53 = new Route53Client();
const ecs = new ECSClient();
const ec2 = new EC2Client();

/**
 * Updates a Route53 record when an ECS task changed in the cluster
 * @param event ECS - Status Changed
 * @returns 
 */

export const handler = async (event: EventBridgeEvent<"Status Changed", any>) => {

  // Get taskId from EventBridge event
  const taskId = event.detail.taskArn;

  //get the public IP from an ECS Task
  const response = await ecs.send(new DescribeTasksCommand({
    cluster: process.env.CLUSTER_NAME,
    tasks: [taskId]
  }));
  //check that response returns only one task with attachments
  if (response.tasks?.length !== 1) {
    console.error('No task found');
    return;
  }
  if (!response.tasks[0].attachments || response.tasks[0].attachments.length === 0) {
    console.error('No attached ENI');
    return;
  }
  const attachments: Attachment[] = response.tasks[0].attachments;
  const eniId = attachments.find(attachment => attachment.type === 'ElasticNetworkInterface')?.details?.find(detail => detail.name === 'networkInterfaceId')?.value;
  if (!eniId) {
    console.error('No network interface found');
    return;
  }
  const eniDetails = await ec2.send(new DescribeNetworkInterfacesCommand({
    NetworkInterfaceIds: [eniId]
  }));

  if (!eniDetails.NetworkInterfaces) console.error('No network interface attached');
  else {
    const publicIp = eniDetails.NetworkInterfaces[0]?.Association?.PublicIp;

    if (!publicIp) {
      console.error('No public IP found');
      return;
    }

    // Get the Route 53 zone ID

    // Update the record set 
    await route53.send(new ChangeResourceRecordSetsCommand({
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: process.env.RECORD_NAME,
              Type: 'A',
              TTL: 60,
              ResourceRecords: [
                {
                  Value: publicIp
                }
              ]
            }
          }
        ]
      },
      HostedZoneId: process.env.ZONE_ID
    })
    );
  }
}