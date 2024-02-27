import { APIEmbed } from 'discord.js';
import { InfoResponse, queryGameServerInfo } from 'steam-server-query';
import moment from 'moment'

interface EC2Tag {
  Key: string,
  Value: string
}
interface QueryGameEvent {
  host: string,
  state: string,
  instanceType: string,
  userId: string,
  launchTime: string,
  tags: EC2Tag[]
}

export const handler = async ({ host, state, instanceType, userId, tags }: QueryGameEvent): Promise<{ content: string, embeds?: APIEmbed[] }> => {
  if (state !== 'running') {

    return {
      // content: `Server ${name} (${game}) is running with ${players}/${maxPlayers} online on AWS ${instanceType}. Add to [favorites](steam://connect/${host})`,

      "content": "Server is offline",
    };
  }
  const launchTime = parseInt(tags.find(tag => tag.Key === 'x-server-started-on')?.Value ?? '0');
  
  const { name, game, players, maxPlayers, version, port }: Partial<InfoResponse> = await queryGameServerInfo(host);
  return {
    content: `Server ${name} is running with \`${players}/${maxPlayers}\` online on AWS \`${instanceType}.\``,

    embeds: [
      {
        "title": `Server is Online`,
        "color": 0x09e577,
        "fields": [
          {
            "name": `Online`,
            "value": `${players}`,
            "inline": true
          },
          {
            "name": `Slots`,
            "value": `${maxPlayers}`,
            "inline": true
          },
          {
            "name": `Instance Type`,
            "value": `${instanceType}`
          }, {
            "name": 'Last restart',
            "value": `${moment(launchTime).fromNow()}`,
            "inline": true
          }
        ]
      }
    ]
  };
};
