import { StartInstancesCommand, StopInstancesCommand, EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";

const ec2 = new EC2Client();

interface StartStopEventPayload {
    instanceId: string,
    desiredState: 'running' | 'stopped'
}

export const handler = async ({ instanceId, desiredState }: StartStopEventPayload): Promise<any> => {
    const instanceDescription = await ec2.send(new DescribeInstancesCommand({
        InstanceIds: [instanceId]
    }))
    if (instanceDescription.Reservations && instanceDescription.Reservations.length && instanceDescription.Reservations[0].Instances && instanceDescription.Reservations[0].Instances.length) {
        const currentState = instanceDescription.Reservations[0].Instances[0].State?.Name ?? 'unknown'

        if (desiredState === currentState) {
            console.log('instance already ' + currentState)
        }
        if (desiredState === 'running') {
            try {
                await ec2.send(new StartInstancesCommand({ DryRun: true, InstanceIds: [instanceId] }));
            } catch (e) {
                console.error(e)
                throw new Error('Could not change state of EC2 during dry run')
            }
            // Dry run succeeded, run start_instances without dryrun
            try {
                await ec2.send(new StartInstancesCommand({ DryRun: false, InstanceIds: [instanceId] }));
            } catch (e) {
                console.error(e)
                throw new Error('Could start EC2')
            }
        } else {
            try {
                await ec2.send(new StopInstancesCommand({ DryRun: true, InstanceIds: [instanceId] }));
            } catch (e) {
                console.error(e)
                throw new Error('Could not change state of EC2 during dry run')
            }
            // Dry run succeeded, run start_instances without dryrun
            try {
                await ec2.send(new StopInstancesCommand({ DryRun: false, InstanceIds: [instanceId]}));
            } catch (e) {
                console.error(e)
                throw new Error('Could start EC2')
            }
        }
    }
}