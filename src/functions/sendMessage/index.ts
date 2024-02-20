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
export const handler = async ({ applicationId, token, message }: ResponseEvent): Promise<any> => {
    if (!applicationId || !token) {
        await rest.patch<APIRequest>(
            Routes.webhookMessage(applicationId, token),
            {
                content: 'Wrong configuration to handle discord message'
            }
        );
    }
    const { content, embeds }: RESTPostAPIWebhookWithTokenJSONBody = message;
    try {
        console.log(message);
        if (embeds && embeds.length > 0) {
            console.log("embeds");
            try {
                await rest.patch<APIRequest>(Routes.webhookMessage(applicationId, token), {
                    embeds
                });
            } catch (emErr) {
                console.log("error on sending ", embeds);
                console.error(emErr);

                await rest.patch<APIRequest>(
                    Routes.webhookMessage(applicationId, token), { content }
                );
            }
        } else {
            console.log("only content");
            await rest.patch<APIRequest>(Routes.webhookMessage(applicationId, token), { content });
        }
    } catch (e) {
        console.log("error on sending ", embeds);
        console.error(e);

        await rest.patch<APIRequest>(
            Routes.webhookMessage(applicationId, token), { content: e }
        );
    }
    return {};
}