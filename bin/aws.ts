#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EnshInfraStack } from '../lib/aws-stack';
import 'dotenv/config'
import { DiscordStack } from '../lib/discord';
import { BaseStack } from '../lib/base';

const app = new cdk.App();
if (!process.env.HOSTED_ZONE_ID || !process.env.HOSTED_ZONE_NAME) {
  throw new Error("HOSTED_ZONE_ID or HOSTED_ZONE_NAME is not defined")
}
const base = new BaseStack(app, 'Base', {
  hostedZoneId: process.env.HOSTED_ZONE_ID,
  hostedZoneName: process.env.HOSTED_ZONE_NAME,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.AWS_REGION },
})
/*
const hosting = new EnshInfraStack(app, 'Ecs', {

  hostedZoneId: process.env.HOSTED_ZONE_ID,
  hostedZoneName: process.env.HOSTED_ZONE_NAME,
  recordName: process.env.RECORD_NAME,
  serverName: process.env.SERVER_NAME || "AWS",
  serverPassword: process.env.SERVER_PASSWORD || "AWS",
  serverMaxSlot: process.env.SERVER_MAX_SLOT || "1",
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.AWS_REGION },

  // env: { account: '123456789012', region: 'us-east-1' },

});
*/
const commandHandling = new DiscordStack(app, 'Discord', {
  hostedZone: base.hostedZone,

  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.AWS_REGION },

});