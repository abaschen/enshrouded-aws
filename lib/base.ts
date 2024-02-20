import { Stack, StackProps } from "aws-cdk-lib";
import { HostedZone, IHostedZone } from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface BaseStackProps extends StackProps {
    hostedZoneId: string;
    hostedZoneName: string;
}

export class BaseStack extends Stack {
    hostedZone: IHostedZone

    constructor(scope: Construct, id: string, props: BaseStackProps) {
        super(scope, id, props);
        this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
            hostedZoneId: props.hostedZoneId,
            zoneName: props.hostedZoneName
        });
    }
}
