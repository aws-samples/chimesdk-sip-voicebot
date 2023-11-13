import os
import json
import logging
import boto3
from botocore.client import Config
lex_client = boto3.client('lexv2-runtime')
logger = logging.getLogger()
logger.setLevel(logging.INFO)

LANG = os.environ['LANG'] if os.environ['LANG'] else 'en'
BOT_ALIAS_ID = os.environ['LEX_BOT_ALIAS_ID']
BOT_ID = os.environ['LEX_BOT_ID']
AWS_REGION = os.environ['AWS_REGION']


def lambda_handler(event, context):
    logger.info(json.dumps(event, indent=2))
    
    event_type = event['InvocationEventType']
    call_details = event['CallDetails']
    participants = event['CallDetails']['Participants']
    call_id = participants[0]['CallId']
    to_number = participants[0]['To']
    from_number = participants[0]['From']
    account_id = context.invoked_function_arn.split(":")[4]

    global LOG_PREFIX
    LOG_PREFIX = f'Call-ID:{call_id} event_type From:[{from_number}] To:[{to_number}]: '
    logger.info('Event Type: %s', event_type)
    logger.info('-----------------------Call Details-----------------------')
    logger.info(json.dumps(call_details, indent=2))
    logger.info('-----------------------Call Details-----------------------')

    if event_type == 'NEW_INBOUND_CALL':
        logger.info('RECV %s %s', LOG_PREFIX, 'NEW_INBOUND_CALL event received')
        return new_call_handler(call_id, from_number, account_id)
    elif event_type == 'ACTION_SUCCESSFUL':
        logger.info('-----------------------Action Data-----------------------')
        logger.info(json.dumps(event, indent=2))
        logger.info('-----------------------Action Data-----------------------')
        logger.info('RECV %s %s', LOG_PREFIX,'ACTION_SUCCESSFUL event received')

        speakOutput = 'Thank you for calling the Order Flowers Amazon Lex Bot.  Goodbye for now.'

        return respond(
            speak_action(
                call_id,
                speakOutput),
            hangup_action(call_id))
    elif event_type == 'HANGUP':
        logger.info('RECV %s %s', LOG_PREFIX, 'HANGUP event received')
        return hangup_handler(participants)
    else:
        logger.error('RECV %s [Unhandled event] %s', LOG_PREFIX, json.dumps(event))
        return unable_to_connect(call_id)


def respond(*actions):
    logger.info('-----------------------Response-----------------------')
    logger.info(json.dumps(actions, indent=2))
    logger.info('-----------------------Response-----------------------')
    return {
        'SchemaVersion': '1.0',
        'Actions': [*actions]
    }


def new_call_handler(call_id, from_number, account_id):
    return start_bot_conversation_action(
        call_id,
        account_id,
        from_number)


def hangup_handler(participants):
    for call in participants:
        if call['Status'] == 'Connected':
            return respond([hangup_action(call['CallId'])])
    logger.info('NONE %s All calls have been hungup', LOG_PREFIX)
    return respond('')


def unable_to_connect(call_id):
    speakOutput = 'Sorry, we were unable to process your call.'
    return respond(speak_action(call_id, speakOutput), hangup_action(call_id))


def speak_action(call_id, speak_text):
    logger.info('SEND %s %s %s', LOG_PREFIX, 'Sending SPEAK action to Call-ID', call_id)
    locale = 'en-US'
    voice = 'Joanna'
    engine = 'neural'

    return {
        'Type': 'Speak',
        'Parameters': {
            'CallId': call_id,
            'Text': speak_text,
            'Engine': engine,
            'LanguageCode': locale,
            'TextType': 'text',
            'VoiceId': voice
        }
    }


def hangup_action(call_id):
    logger.info('SEND %s %s %s', LOG_PREFIX, 'Sending HANGUP action to Call-ID', call_id)
    return {
        'Type': 'Hangup',
        'Parameters': {
            'CallId': call_id,
            'SipResponseCode': '0'
        }
    }


def start_bot_conversation_action(call_id, account_id, from_number):
    logger.info('SEND %s %s %s', LOG_PREFIX, 'Sending STARTBOTCONVERSAION action to Call-ID', call_id)
    speakOutput = "Welcome to the Order Flowers SIP Integration Demo using Amazon Chime SDK. To get started, you can say, Order Flowers."
    locale = 'en_US'
    return {
        "SchemaVersion": "1.0",
        "Actions": [
            
            {
                "Type": "VoiceFocus",
                "Parameters": {
                    "Enable": True,
                    "CallId": call_id
                }
            },
            
            {
                "Type": "StartBotConversation",
                "Parameters": {
                    "CallId": call_id,
                    "BotAliasArn": 'arn:aws:lex:' + AWS_REGION + ':' + account_id + ':bot-alias/' + BOT_ID + '/' + BOT_ALIAS_ID,
                    "LocaleId": locale,
                    "Configuration": {
                        "SessionState": {
                            "SessionAttributes": {
                                'phoneNumber': from_number
                            },
                            "DialogAction": {"Type": "ElicitIntent"},
                        },
                        "WelcomeMessages": [
                            {
                                "Content": speakOutput,
                                "ContentType": "PlainText"
                            }]
                    }
                }
            }
        ]
    }
