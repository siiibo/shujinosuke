import { SlackEvent } from '@slack/bolt'
import { handleSlackAction } from './actionHandler'
import { handleSlackEvent } from './eventHandler'
import { GasWebClient as SlackClient } from '@hi-se/web-api';
import { checkParticipants, continueSession, endSession } from './channelState'
import { isAction, isEvent, isJson, isUrlVerification } from './utilities';

export { SlackClient }

const TOKEN_SHEET_ID = '1ExiQonKpf2T8NnR9YFMzoD7jobHEuAXUUq3vaBL0hW8';
export const EMOJI_EVENT_POST_CHANNEL = "C011BG29K71" // #雑談
export const CHECK_TIMEOUT_SECONDS = 1200;
export const ENDING_PERIOD_SECONDS = 300;
export const CALL_REMINDER_SECONDS = 180;

export const init = () => {
  const sheet = SpreadsheetApp.openById(TOKEN_SHEET_ID).getSheets()[0];
  const row = sheet.getRange('A:A').createTextFinder('Shujinosuke').findNext().getRow();
  const column = sheet.getRange(1, 1, 1, sheet.getLastColumn()).createTextFinder('Token').findNext().getColumn();
  const slackToken = sheet.getRange(row, column).getValue();
  PropertiesService.getScriptProperties().setProperty('SLACK_TOKEN', slackToken);
}

export const getSlackClient = () => {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_TOKEN');
  return new SlackClient(token);
}




const doPost = (e: GoogleAppsScript.Events.DoPost) => {
  console.info(`[doPost raw event]\n\n${JSON.stringify(e)}`);
  if (isUrlVerification(e)) {
    return ContentService.createTextOutput(JSON.parse(e.postData.contents)['challenge']);
  }

  const client = getSlackClient();
  if (isAction(e)) {
    handleSlackAction(client, JSON.parse(e.parameter['payload']));
  } else if (isEvent(e)) {
    const event = JSON.parse(e.postData.contents).event as SlackEvent;
    handleSlackEvent(client, event);
  }
  return ContentService.createTextOutput('OK');

}

declare const global: any;
global.doPost = doPost;
global.init = init;
global.continueSession = continueSession;
global.checkParticipants = checkParticipants;
global.endSession = endSession;
