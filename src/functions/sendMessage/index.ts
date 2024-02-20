import { RESTPostAPIWebhookWithTokenJSONBody, RouteBases, Routes } from 'discord-api-types/v10';
import axios from 'axios';
import { ResponseEvent } from '../../Types';

// todo move to lambda layer
const rest = axios.create({
    baseURL: RouteBases.api,
    headers: {
        'Content-Type': 'application/json'
    }
});
interface APIRequest {
    content: string,
    embeds?: any[]
}
if (!process.env.WEBHOOK_ID || !process.env.WEBHOOK_TOKEN) {
    throw new Error("WEBHOOK_ID or WEBHOOK_TOKEN not set");
}
const webhookId: string = process.env.WEBHOOK_ID;
const webhookToken: string = process.env.WEBHOOK_TOKEN;
const webhook = false;
async function send({ applicationId, token }, content: string, embeds: any[] | undefined = undefined) {
    if (webhook) {
        return await rest.post<APIRequest>(Routes.webhook(webhookId, webhookToken), {
            content,
            embeds
        });
    }
    return await rest.patch<APIRequest>(Routes.webhookMessage(applicationId, token), {
        content,
        embeds
    });

}

export const handler = async ({ applicationId, token, message }: ResponseEvent): Promise<any> => {
    if (!applicationId || !token) {
        throw new Error('Wrong configuration to handle discord message');
    }
    const { content, embeds }: RESTPostAPIWebhookWithTokenJSONBody = message;
    try {
        console.log(message);
        if (embeds && embeds.length > 0) {
            console.log("embeds");
            try {
                await send({ applicationId, token }, '', embeds);
            } catch (emErr) {
                console.log("error on sending ", emErr);
                console.error(JSON.stringify(emErr.response.data.errors));

                await send({ applicationId, token }, content);
            }
        } else {
            console.log("only content");
            await send({ applicationId, token }, content);
        }
    } catch (e) {
        console.error(JSON.stringify(e));

        await send({ applicationId, token }, content);

    }
    return {};
}