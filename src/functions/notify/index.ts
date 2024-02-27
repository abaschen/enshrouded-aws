import { CreateTagsCommand, EC2Client } from "@aws-sdk/client-ec2";

import axios from 'axios';
import { RouteBases, Routes } from 'discord-api-types/v10';

import { EventBridgeEvent } from 'aws-lambda';

// todo move to lambda layer
const rest = axios.create({
    baseURL: RouteBases.api,
    headers: {
        'Content-Type': 'application/json'
    }
});
const ec2 = new EC2Client();

interface APIRequest {
    content: string,
    embeds?: any[]
}
if (!process.env.WEBHOOK_ID || !process.env.WEBHOOK_TOKEN) {
    throw new Error("WEBHOOK_ID or WEBHOOK_TOKEN not set");
}
const webhookId: string = process.env.WEBHOOK_ID;
const webhookToken: string = process.env.WEBHOOK_TOKEN;


export const handler = async ({ detail: { state, 'instance-id': instanceId } }: EventBridgeEvent<"EC2 Instance State-change Notification", { state: string, 'instance-id': string }>): Promise<any> => {
    let color = 0x09e577;
    let text = state;
    if (state === "stopped" || state === "stopping") {
        color = 0xff0000;
    }
    else if (state === "pending") {
        color = 0xf3a304;
        text = "starting"
    } else if (state === "running") {
        await ec2.send(new CreateTagsCommand({
            Tags: [{
                Key: 'x-server-started-on',
                Value: `${Date.now()}`
            }],
            Resources: [
                instanceId
            ]
        }));
    }
    console.log(`Server is ${text}`)
    // return await rest.post<APIRequest>(Routes.webhook(webhookId, webhookToken), {
    //     embeds: [
    //         {
    //             title: `Server is ${text}`,
    //             color
    //         }
    //     ]
    // });

}