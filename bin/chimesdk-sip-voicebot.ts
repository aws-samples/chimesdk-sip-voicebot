#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ChimesdkSipVoicebotStack } from '../lib/chimesdk-sip-voicebot-stack';
import { config } from 'dotenv';

config();

const props = {
  logLevel: process.env.LOG_LEVEL || 'INFO',
  phoneNumberState: process.env.PHONE_NUMBER_STATE || 'AZ',
};

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  process.env.CDK_DEFAULT_REGION
};

const app = new App();
new ChimesdkSipVoicebotStack(app, 'ChimesdkSipVoicebotStack', {
  ...props,
  env: devEnv,
});
