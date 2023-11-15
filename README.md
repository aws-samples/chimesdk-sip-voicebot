# Chime SDK SIP Voice Bot
This repo is a companion to the blog "Add voice bots to your existing telephony services to using Amazon Chime SDK." It deploys an Amazon Chime SDK Voice Connector and Amazon Lex chatbot (the Order Flowers demo). Using the SIP endpoint provided by the Voice Connector, you can connect external telephony systems to Amazon Lex chatbots. 

## Instalation
This is an [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) application. Review the [prereqs here](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html#getting_started_prerequisites). 

[AWS CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/welcome.html) provides a fast way to deploy AWS CDK apps because it has all of the AWS dependencies installed & ready to go. 

1. Clone this repo to your dev environment. 
2. cd chimesdk-sip-voicebot
3. cdk bookstrap
4. cdk install 
5. cdk deploy 

If desired, change the `PHONE_NUMBER_STATE=` setting in the `.env` file to the US state of your choice (2 character code); AZ (Arizona) will be used if left as-is. 

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

