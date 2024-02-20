import { APIEmbed } from "discord.js";

export interface ResponseEvent {
    applicationId: string;
    token: string;
    message: {
        content: string,
        embeds?: APIEmbed[]
    }
}
