import { SFNClient, StartExecutionCommand, StartExecutionInput } from "@aws-sdk/client-sfn";
import { APIGatewayEvent, APIGatewayProxyResultV2 } from 'aws-lambda';

import { APIBaseInteraction, APIInteractionResponse, InteractionResponseType, InteractionType, MessageFlags, APIInteractionResponseChannelMessageWithSource, APIApplicationCommandSubcommandOption } from 'discord-api-types/v10';
import { Buffer } from 'node:buffer';
import { sign } from "tweetnacl";

const REGION = process.env.AWS_REGION || "eu-west-1";

const client = new SFNClient({ region: REGION });

const target = process.env.STATE_MACHINE_ARN;
if (!process.env.APP_PUBLIC_KEY || !target) {
    process.exit(1);
}
const ephemeral = process.env.EPHEMERAL === 'true';
var publicKeyBuffer = Buffer.from(process.env.APP_PUBLIC_KEY, "hex");
export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResultV2<APIInteractionResponse>> => {
    const checksum = {
        sig: event.headers["x-signature-ed25519"],
        timestamp: event.headers["x-signature-timestamp"]
    };
    if (!event.body || !checksum.timestamp || !checksum.sig) {
        return {
            statusCode: 400,
            body: JSON.stringify({ errorMessage: "Invalid request" })
        };
    }
    let isVerified = false;

    try {
        isVerified = sign.detached.verify(
            Buffer.from(checksum.timestamp + event.body),
            Buffer.from(checksum.sig, "hex"),
            publicKeyBuffer
        );
    } catch (e) {
        console.log(e);
        isVerified = false
    }
    if (!isVerified) {
        return {
            statusCode: 401,
            body: JSON.stringify({ errorMessage: "invalid signature" })
        };
    }

    const { type, token, application_id, id: interactionId, channel, data, member }: APIBaseInteraction<InteractionType.Ping | InteractionType.ApplicationCommand, APIApplicationCommandSubcommandOption> = JSON.parse(event.body);
    if (type === InteractionType.Ping) {
        return {
            statusCode: 200,
            body: JSON.stringify({ type: InteractionResponseType.Pong })
        };
    }
    if (type === InteractionType.ApplicationCommand) {
        try {
            console.log(JSON.stringify(event));
            if (!data || data.name !== 'server') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ errorMessage: 'Invalid command' })
                };
            }

            const notification: StartExecutionInput = {
                stateMachineArn: target,
                input: JSON.stringify({
                    type: type.toString(),
                    userId: (member?.user?.id ?? 'noId').toString(),
                    userName: (member?.user?.username ?? 'noName').toString(),
                    command: data.name,
                    subcommand: data.options?.[0]?.name,
                    token: token,
                    channelId: channel?.id,
                    applicationId: application_id,
                    interactionId: interactionId,
                    data: data
                }),
            };
            console.log("sending notification: \n" + JSON.stringify(notification));

            await client.send(new StartExecutionCommand(notification));

        } catch (err) {
            console.error(err);
            return {
                statusCode: 500,
                body: JSON.stringify({ errorMessage: "Could not process event" })
            };
        }
        let response: APIInteractionResponse;
        if (ephemeral) {
            response = {
                type: InteractionResponseType.ChannelMessageWithSource,
                data: {
                    content: "Command sent",
                    flags: MessageFlags.Ephemeral
                }
            };
        } else {
            response = {
                type: InteractionResponseType.DeferredChannelMessageWithSource
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify(response)
        };
    }
    return {
        statusCode: 400,
    };
}