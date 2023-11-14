import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import {
  Role,
  ServicePrincipal,
  PolicyDocument,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { ImportBot } from 'cdk-lex-zip-import';
import {
  ChimeVoiceConnector,
  ChimePhoneNumber,
  ChimeSipMediaApp,
  ChimeSipRule,
  PhoneNumberType,
  PhoneProductType,
  TriggerType,
} from 'cdk-amazon-chime-resources';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';

export interface ChimesdkSipVoicebotStackProps extends StackProps {
  logLevel: string;
  phoneNumberState: string;
}

export class ChimesdkSipVoicebotStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ChimesdkSipVoicebotStackProps,
  ) {
    super(scope, id, props);

    // Amazon Lex -- IAM Role and import OrderFlowers zip
    const lexRole = new Role(this, 'lexRole', {
      assumedBy: new ServicePrincipal('lex.amazonaws.com'),
      inlinePolicies: {
        ['lexPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['polly:SynthesizeSpeech', 'comprehend:DetectSentiment'],
            }),
          ],
        }),
      },
    });

    const bot = new ImportBot(this, 'lexBot', {
      sourceDirectory: './src/lexbot',
      lexRoleArn: lexRole.roleArn,
    });

    const resourceArn = `arn:aws:lex:${this.region}:${this.account}:bot-alias/${bot.botId}/${bot.botAliasId}`;

    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowChimePstnAudioUseBot',
          Effect: 'Allow',
          Principal: { Service: 'voiceconnector.chime.amazonaws.com' },
          Action: 'lex:StartConversation',
          Resource: resourceArn,
          Condition: {
            StringEquals: { 'AWS:SourceAccount': `${this.account}` },
            ArnEquals: {
              'AWS:SourceArn': `arn:aws:voiceconnector:${this.region}:${this.account}:*`,
            },
          },
        },
      ],
    };
    bot.addResourcePolicy(resourceArn, policy);

    // Create Chime SDK Voice Connector
    // Note: please check Twilio IP ranges for accuracy, or modify for your SIP environment
    // https://www.twilio.com/docs/sip-trunking/ip-addresses , Amazon Chime SDK does not restrict 'Media IPs'
    const voiceConnector = new ChimeVoiceConnector(this, 'voiceConnector', {
      name: 'twilio-sip-voiceconnector',
      region: this.region,
      encryption: true,
      termination: {
        callingRegions: ['US'],
        terminationCidrs: [
          '54.172.60.0/30',
          '54.244.51.0/30',
          '54.171.127.192/30',
          '35.156.191.128/30',
          '54.65.63.192/30',
          '54.169.127.128/30',
          '54.252.254.64/30',
          '177.71.206.192/30',
        ],
      },
      loggingConfiguration: {
        enableSIPLogs: true,
        enableMediaMetricLogs: true,
      },
    });

    // Create a lambda function to handle the chime events
    const chimeSDKHandler = new Function(this, 'ChimeSDKHandler', {
      runtime: Runtime.PYTHON_3_11,
      code: Code.fromAsset('./src/chimehandler'),
      handler: 'index.lambda_handler',
      environment: {
        lang: 'EN',
        LEX_BOT_ALIAS_ID: `${bot.botAliasId}`,
        LEX_BOT_ID: `${bot.botId}`,
      },
      timeout: Duration.seconds(60),
    });

    const phoneNumber = new ChimePhoneNumber(this, 'phoneNumber', {
      phoneState: props.phoneNumberState,
      phoneNumberType: PhoneNumberType.LOCAL,
      phoneProductType: PhoneProductType.SMA,
    });

    const sipMediaApp = new ChimeSipMediaApp(this, 'twilio-sma', {
      region: this.region,
      endpoint: chimeSDKHandler.functionArn,
      name: 'twilio-sip-mediaapp',
    });

    sipMediaApp.logging({
      enableSipMediaApplicationMessageLogs: true,
    });

    new ChimeSipRule(this, 'phone', {
      triggerType: TriggerType.TO_PHONE_NUMBER,
      triggerValue: phoneNumber.phoneNumber,
      targetApplications: [
        {
          region: this.region,
          priority: 1,
          sipMediaApplicationId: sipMediaApp.sipMediaAppId,
        },
      ],
    });

    new ChimeSipRule(this, 'sip', {
      triggerType: TriggerType.REQUEST_URI_HOSTNAME,
      triggerValue:
        voiceConnector.voiceConnectorId + '.voiceconnector.chime.aws',
      targetApplications: [
        {
          region: this.region,
          priority: 1,
          sipMediaApplicationId: sipMediaApp.sipMediaAppId,
        },
      ],
    });

    // Create outputs
    new CfnOutput(this, 'ChimePhoneNumber', {
      value: phoneNumber.phoneNumber,
      description: 'Chime Phone Number',
      exportName: 'ChimePhoneNumber',
    });

    new CfnOutput(this, 'ChimeVoiceConnectorId', {
      value: voiceConnector.voiceConnectorId,
      description: 'Chime Voice Connector Id',
      exportName: 'ChimeVoiceConnectorId',
    });
  }
}
