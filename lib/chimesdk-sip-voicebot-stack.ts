import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as chime from "cdk-amazon-chime-resources";
import * as lexupload from "cdk-lex-zip-import";
import * as iam from "aws-cdk-lib/aws-iam";

export class ChimesdkSipVoicebotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //create parameter for US State
    const chimePhoneNumberLocation = new cdk.CfnParameter(
      this,
      "chimePhoneNumberLocation",
      {
        type: "String",
        description: "Area codes for the specified US State",
      }
    );

    //Amazon Lex -- IAM Role and import OrderFlowers zip
    const lexRole = new iam.Role(this, "lexRole", {
      assumedBy: new iam.ServicePrincipal("lex.amazonaws.com"),
      inlinePolicies: {
        ["lexPolicy"]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: ["polly:SynthesizeSpeech", "comprehend:DetectSentiment"],
            }),
          ],
        }),
      },
    });

    const bot = new lexupload.ImportBot(this, "lexBot", {
      sourceDirectory: "./src/lexbot",
      lexRoleArn: lexRole.roleArn,
    });

    const resourceArn = `arn:aws:lex:${this.region}:${this.account}:bot-alias/${bot.botId}/${bot.botAliasId}`;

    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowChimePstnAudioUseBot",
          Effect: "Allow",
          Principal: { Service: "voiceconnector.chime.amazonaws.com" },
          Action: "lex:StartConversation",
          Resource: resourceArn,
          Condition: {
            StringEquals: { "AWS:SourceAccount": `${this.account}` },
            ArnEquals: {
              "AWS:SourceArn": `arn:aws:voiceconnector:${this.region}:${this.account}:*`,
            },
          },
        },
      ],
    };
    bot.addResourcePolicy(resourceArn, policy);

    //create Chime SDK Voice Connector
    //note: please check Twilio IP ranges for accuracy, or modify for your SIP environment
    //https://www.twilio.com/docs/sip-trunking/ip-addresses , Amazon Chime SDK does not restrict 'Media IPs'
    const voiceConnector = new chime.ChimeVoiceConnector(
      this,
      "voiceConnector",
      {
        name: "twilio-sip-voiceconnector",
        region: this.region,
        encryption: true,
        termination: {
          callingRegions: ["US"],
          terminationCidrs: [
            "54.172.60.0/30",
            "54.244.51.0/30",
            "54.171.127.192/30",
            "35.156.191.128/30",
            "54.65.63.192/30",
            "54.169.127.128/30",
            "54.252.254.64/30",
            "177.71.206.192/30",
          ],
        },
        loggingConfiguration: {
          enableSIPLogs: true,
          enableMediaMetricLogs: true,
        },
      }
    );

    //create a lambda function to handle the chime events
    const chimeSDKHandler = new lambda.Function(this, "ChimeSDKHandler", {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset("./src/chimehandler"),
      handler: "index.lambda_handler",
      environment: {
        lang: "EN",
        LEX_BOT_ALIAS_ID: `${bot.botAliasId}`,
        LEX_BOT_ID: `${bot.botId}`,
      },
      timeout: cdk.Duration.seconds(60),
    });

    const phoneNumber = new chime.ChimePhoneNumber(this, "phoneNumber", {
      phoneState: chimePhoneNumberLocation.valueAsString,
      phoneNumberType: chime.PhoneNumberType.LOCAL,
      phoneProductType: chime.PhoneProductType.SMA,
    });

    const sipMediaApp = new chime.ChimeSipMediaApp(this, "twilio-sma", {
      region: this.region,
      endpoint: chimeSDKHandler.functionArn,
      name: "twilio-sip-mediaapp",
    });

    sipMediaApp.logging({
      enableSipMediaApplicationMessageLogs: true,
    });

    const sipRulePhone = new chime.ChimeSipRule(this, "phone", {
      triggerType: chime.TriggerType.TO_PHONE_NUMBER,
      triggerValue: phoneNumber.phoneNumber,
      targetApplications: [
        {
          region: this.region,
          priority: 1,
          sipMediaApplicationId: sipMediaApp.sipMediaAppId,
        },
      ],
    });

    const sipRuleURI = new chime.ChimeSipRule(this, "sip", {
      triggerType: chime.TriggerType.REQUEST_URI_HOSTNAME,
      triggerValue:
        voiceConnector.voiceConnectorId + ".voiceconnector.chime.aws",
      targetApplications: [
        {
          region: this.region,
          priority: 1,
          sipMediaApplicationId: sipMediaApp.sipMediaAppId,
        },
      ],
    });

    //create outputs
    new cdk.CfnOutput(this, "ChimePhoneNumber", {
      value: phoneNumber.phoneNumber,
      description: "Chime Phone Number",
      exportName: "ChimePhoneNumber",
    });

    new cdk.CfnOutput(this, "ChimeVoiceConnectorId", {
      value: voiceConnector.voiceConnectorId,
      description: "Chime Voice Connector Id",
      exportName: "ChimeVoiceConnectorId",
    });
  }
}
