import { SlackEvent, AppMentionEvent, EmojiChangedEvent, GenericMessageEvent, ChannelCreatedEvent } from '@slack/bolt'
import { SlackAction, BlockAction, ButtonAction } from '@slack/bolt'
import { GasWebClient as SlackClient } from '@hi-se/web-api';

import moment from 'moment';
moment.locale('ja');

const TOKEN_SHEET_ID = '1ExiQonKpf2T8NnR9YFMzoD7jobHEuAXUUq3vaBL0hW8';
const CHECK_TIMEOUT_SECONDS = 1200;
const ENDING_PERIOD_SECONDS = 300;
const CALL_REMINDER_SECONDS = 180;

const isJson = (e: GoogleAppsScript.Events.DoPost) => {
  return e.postData.type === 'application/json';
}

const isUrlVerification = (e: GoogleAppsScript.Events.DoPost) => {
  if (isJson(e) && e.postData.contents) {
    return (JSON.parse(e.postData.contents).type === 'url_verification');
  } else {
    return false;
  }
}

const isAction = (e: GoogleAppsScript.Events.DoPost) => {
  // TODO: payload.typeがaction_blocksかinteractive_messageかである必要
  return e.parameter.hasOwnProperty('payload');
}

const isEvent = (e: GoogleAppsScript.Events.DoPost) => {
  if (isJson(e) && e.postData.contents) {
    return JSON.parse(e.postData.contents).hasOwnProperty('event');
  } else {
    return false;
  }
}


interface ChannelState {
  waiting: string[],
  done: string[]
}

type SessionUserState = 'waiting' | 'done';

const setSessionUserState = (channelId: string, userId: string, userState: SessionUserState) => {
  PropertiesService.getScriptProperties().setProperty(userId, `${channelId}-${userState}`);
}

const deleteSessionUserState = (userId: string) => {
  PropertiesService.getScriptProperties().deleteProperty(userId);
}

const initializeSession = (channelId: string) => {
  setSessionChannelId(channelId);
  ScriptApp.newTrigger(sendReminderForJoin.name)
    .timeBased()
    .after(CALL_REMINDER_SECONDS * 1000)
    .create();
  ScriptApp.newTrigger(sendReminderForEndSession.name)
    .timeBased()
    .after(CHECK_TIMEOUT_SECONDS * 1000)
    .create();
}

const abortSession = (channelId: string) => {
  deleteSessionChannelId();
  deleteChannelState(channelId);
  //TODO: 複数のチャンネルでShujinosukeを運用するのであれば、削除するTriggerを絞る必要がある
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
}

const sendReminderForJoin = async () => {
  const exceptions = ["U010MMQGD96", "UU8H6MKEU"]; //Shujinosuke and observers
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  const channelState = getChannelState(sessionChannelId);
  const channelMembers = client.conversations.members({
    channel: sessionChannelId
  }).members.filter(userId => !exceptions.includes(userId));
  const remindTargets = channelMembers.filter(userId => {
    return (
      !channelState.done.includes(userId) &&
      !channelState.waiting.includes(userId)
    )
  });
  remindTargets.forEach(async (remindTarget) => {
    if (client.users.getPresence({ user: remindTarget }).presence === 'active') {
      client.chat.postEphemeral({
        channel: sessionChannelId,
        user: remindTarget,
        text: (
          `:white_check_mark: <@${remindTarget}>さん、今週の週次が始まっています！` +
          `:old_key: 参加する場合は 「参加」ボタンをクリックか、 \`@Shujinosuke 参加\` と発言してください！`
        )
      })
    }
  });
}


const sendReminderForEndSession = () => {
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  const channelState = getChannelState(sessionChannelId);
  if (!channelState?.waiting.length && !channelState?.done.length) {
    abortSession(sessionChannelId);
    client.chat.postMessage({
      channel: sessionChannelId,
      text: `:fast_forward: 終了します。`
    })
  }
  if (channelState?.waiting.length) {
    client.chat.postMessage({
      channel: sessionChannelId,
      text: (
        `:stopwatch: あと${channelState.waiting.length}人です。全体連絡を先に始めていてもOKです。\n` +
        `:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてください。`
      )
    })
  }
}

const endSession = () => {
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  if (getChannelState(sessionChannelId)) {
    abortSession(sessionChannelId);
    client.chat.postMessage({
      channel: sessionChannelId,
      text: (
        `:stopwatch: 時間になりました！ みなさんご協力ありがとうございました。 :bow:\n` +
        `:rainbow: リフレッシュして、業務に戻りましょう！ :notes:`
      )
    });
  }
}


const checkAllReported = (client: SlackClient, channelId: string) => {
  let channelState = getChannelState(channelId);
  if (channelState && channelState.waiting.length === 0) {
    ScriptApp.newTrigger(endSession.name)
      .timeBased()
      .after(ENDING_PERIOD_SECONDS * 1000)
      .create();
    const readableEndingPeriod = moment
      .duration(ENDING_PERIOD_SECONDS, 'seconds')
      .humanize();
    client.chat.postMessage({
      channel: channelId,
      text: (
        `:+1: 全員のレポートが完了しました！\n` +
        `:stopwatch: それでは、${readableEndingPeriod}ほど時間を取りますので、全体連絡のある方はお願いします。\n` +
        `:eyes: また、この時間で皆さんのレポートを読んでコメントしましょう！（もちろん時間が過ぎたあとも続けて:ok:）\n` +
        `:google: こちらのMeetに参加しておしゃべりもどうぞ！ https://meet.google.com/ofo-ykna-amj`
      )
    })
  }
}


const join = (client: SlackClient, channelId: string, userId: string) => {
  const channelState = getChannelState(channelId);
  if (!channelState) {
    client.chat.postMessage({ channel: channelId, text: 'no channel state' });
    return;
  }
  if (
    channelState.waiting.includes(userId) ||
    channelState.done.includes(userId)
  ) {
    client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: '既に参加済みです'
    });
  } else {
    setSessionUserState(channelId, userId, 'waiting');
    client.chat.postMessage({ channel: channelId, text: `:hand: <@${userId}> が参加しました` });
  }
}

const leave = (client: SlackClient, channelId: string, userId: string) => {
  const channelState: ChannelState = getChannelState(channelId);
  if (!isStarted(channelId)) {
    client.chat.postMessage({ channel: channelId, text: 'no channel state' });
    return;
  }
  if (channelState.waiting.includes(userId)) {
    deleteSessionUserState(userId);
    client.chat.postMessage({ channel: channelId, text: `:wave: <@${userId}> がキャンセルしました` });
    checkAllReported(client, channelId);
  }
}

const makeUserStateDone = (channelId: string, userId: string): void => {
  // Slackの3秒ルールのもとGASで排他制御するのは困難なため、直前の状態がwaitingであるかどうかは確認しない
  setSessionUserState(channelId, userId, 'done');
}

const getChannelState = (channelId: string): ChannelState => {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const participants = Object.entries(properties).filter(([key, value]) => {
    return value.includes(channelId);
  });
  const waiting = participants.filter(([_, value]) => {
    return value.includes('waiting');
  }).map(([key, _]) => { return key });
  const done = participants.filter(([_, value]) => {
    return value.includes('done');
  }).map(([key, _]) => { return key });
  return {
    waiting: waiting,
    done: done
  };
}

const isStarted = (channelId: string): boolean => {
  const channelState = getChannelState(channelId);
  if (channelState.done.length || channelState.waiting.length) {
    return true;
  } else {
    return false;
  }
}

const deleteChannelState = (channelId: string): void => {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const participants = Object.entries(properties).filter(([key, value]) => {
    return value.includes(channelId);
  });
  participants.forEach(([key, _]) => {
    PropertiesService.getScriptProperties().deleteProperty(key);
  })
}

const getSessionChannelId = () => {
  return PropertiesService.getScriptProperties().getProperty('SessionChannelId');
}

const setSessionChannelId = (channelId: string) => {
  PropertiesService.getScriptProperties().setProperty('SessionChannelId', channelId);
}


const deleteSessionChannelId = () => {
  PropertiesService.getScriptProperties().deleteProperty('SessionChannelId');
}



const init = () => {
  const sheet = SpreadsheetApp.openById(TOKEN_SHEET_ID).getSheets()[0];
  const row = sheet.getRange('A:A').createTextFinder('Shujinosuke').findNext().getRow();
  const column = sheet.getRange(1, 1, 1, sheet.getLastColumn()).createTextFinder('Token').findNext().getColumn();
  const slackToken = sheet.getRange(row, column).getValue();
  PropertiesService.getScriptProperties().setProperty('SLACK_TOKEN', slackToken);
}

const getSlackClient = () => {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_TOKEN');
  return new SlackClient(token);
}




const doPost = (e: GoogleAppsScript.Events.DoPost) => {
  console.info({ eventName: 'Shujiinosuke doPost', event: e });
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

const handleSlackAction = (client, payload: SlackAction) => {
  switch (payload.type) {
    case 'block_actions':
      handleBlockAction(client, payload)
  }
}

const handleBlockAction = (client, payload: BlockAction) => {
  const buttons = payload.actions.filter(action => action.type === 'button') as ButtonAction[];
  if ('join' in buttons.map(action => action.value)) {
    join(client, payload.channel.id, payload.user.id);
  }
}


const getHelpMessage = (channelId: string) => {
  const helpCommandsInWaiting = {
    会議の開始: "`開始`",
    Botステータスの確認: "`status`",
    ping: "`ping`",
    ヘルプ: "`ヘルプ` `help`",
    アクティブメンバーの確認: "`誰いる？` `今いる人は？`",
  };
  const helpCommandsInMeeting = {
    レポートの投稿: "`レポート` `調子、出来事、悩み等`",
    会議の開始: "`開始`",
    会議の強制終了: "`終了` `リセット` `reset`",
    会議へ参加: "`参加`",
    参加の取り消し: "`キャンセル`",
    レポート未投稿者の確認: "`あと誰？` `残りは？`",
    Botステータスの確認: "`status`",
    ping: "`ping`",
    ヘルプ: "`ヘルプ` `help`",
    アクティブメンバーの確認: "`誰いる？` `今いる人は？`",
  };

  if (isStarted(channelId)) {
    const commands = Object.entries(helpCommandsInMeeting)
      .map(([command, explanation]) => command + "\n" + explanation)
      .join("\n\n");
    return (
      `:books:会議開始前にShujinosukeで使えるコマンドは以下の通りです！\n` +
      `:bulb:コマンドの前には必ず "@Shujinosuke" をつけましょう！\n\n` +
      `${commands}`
    );
  } else {
    const commands = Object.entries(helpCommandsInWaiting)
      .map(([command, explanation]) => command + "\n" + explanation)
      .join("\n\n");

    return (
      `:books:会議中にShujinosukeで使えるコマンドは以下の通りです！\n` +
      `:bulb:コマンドの前には必ず "@Shujinosuke" をつけましょう！\n\n` +
      commands
    );
  }
}

const getChannelStateMessage = (channelId: string) => {
  const channelState = getChannelState(channelId);
  if (channelState) {
    return (
      `\`\`\`\n` +
      `${JSON.stringify(channelState, null, 2)}\n` +
      `\`\`\``
    );
  } else {
    return (
      `\`\`\`\n` +
      `{}\n` +
      `\`\`\``
    )
  }
}

const isOriginalCommand = (target: string, commandRegExpString: string) => {
  const regExpString = {
    slackMarkUp: "([*_~`>]|`{3,})*",
    slackMention: "<@\\w+[\\w\\s\|]*>\\s+",
    commandEnd: "($|[\\s.]+)", // SlackBotのリマインダーで英字コマンドを呼び出すと文末にピリオド(.)が追加される
  }
  const commandRegExp = new RegExp(
    regExpString.slackMention +
    regExpString.slackMarkUp +
    commandRegExpString +
    regExpString.slackMarkUp +
    regExpString.commandEnd
  );
  return target.match(commandRegExp);
}

const getListen = (client: SlackClient, event: SlackEvent) => {
  switch (event.type) {
    case 'app_mention':
      return (commandRegExpString: string, callback: (client: SlackClient, event: AppMentionEvent) => void) => {
        if (isOriginalCommand(event.text, commandRegExpString)) {
          callback(client, event as AppMentionEvent);
        }
      }
  }
}
const getThreadTs = (event: AppMentionEvent) => {
  return event.thread_ts ? event.thread_ts : event.ts;
}


const handleSlackEvent = (client: SlackClient, event: SlackEvent) => {
  switch (event.type) {
    case 'app_mention':
      handleAppMention(client, event as AppMentionEvent);
      break;
    case 'message':
      handleMessageEvent(client, event as GenericMessageEvent);
      break;
  }
}


const handleMessageEvent = (client: SlackClient, event: GenericMessageEvent) => {
  // subtypeで処理わけ
  const isBot = (event: GenericMessageEvent) => {
    // botからのメッセージのTypeは、公式でまだ未対応 https://github.com/slackapi/bolt-js/issues/580
    return 'bot_id' in event;
  }
}


const handleAppMention = (slackClient: SlackClient, appMentionEvent: AppMentionEvent) => {
  const listen = getListen(slackClient, appMentionEvent);

  listen('開始', (client, event) => {
    if (isStarted(event.channel)) {
      client.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text:
          '既に開始しています。\n' +
          '状態をリセットしてやり直す場合は `リセット` `reset` `終了` のいずれかのコマンドを実行してください。'
      });
    } else {
      initializeSession(event.channel);
      const readableCheckTimeout = moment
        .duration(CHECK_TIMEOUT_SECONDS, 'seconds')
        .humanize();
      client.chat.postMessage({
        channel: event.channel,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `:spiral_calendar_pad: 週次定例を始めます！\n` +
                `:mega: 参加者は「:rocket: 参加」ボタンをクリックか、「 *@Shujinosuke 参加* 」と返信！\n` +
                `:clipboard: 以下をコピーして書き換えてレポートをまとめ、できたらどんどん投稿しましょう！\n` +
                ':warning: レポートを投稿する際は `@Shujinosuke レポート` と入力してください！\n' +
                `:stopwatch: ${readableCheckTimeout}後にリマインドし、全員投稿したら全体連絡の時間に移ります。\n` +
                `:question: 私がちゃんと反応しなかった場合、投稿を一度削除して投稿し直してみてください。\n` +
                `:google: こちらのMeetに参加しておしゃべりもどうぞ！ https://meet.google.com/ofo-ykna-amj`,
            }
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `@Shujinosuke レポート\n` +
                `*調子、出来事、悩み等*\n\n` +
                `* サーバの電流から酸っぱい味がする\n` +
                `* 水曜日以外やることがあんまりなくて暇だ`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: ":rocket: 参加",
                  emoji: true,
                },
                value: "join",
              },
            ],
          },
        ],
        text: '' // https://github.com/slackapi/node-slack-sdk/pull/1197
      });
    }

  });

  listen('レポート|調子、出来事、悩み等', async (client, event) => {
    if (event.edited) {
      return;
    }
    client.chat.postMessage({
      channel: event.channel,
      thread_ts: getThreadTs(event),
      text: `` +
        `:+1: ありがとうございます！\n` +
        `:pencil: 皆さんコメントや質問をどうぞ！\n` +
        `(チャンネルを読みやすく保つため、「以下にも投稿する：<#${event.channel}>」は使わないようにお願いします)`
    });
    if (isStarted(event.channel)) {
      makeUserStateDone(event.channel, event.user);
      checkAllReported(client, event.channel);
    }
  });

  listen('参加', (client, event) => {
    join(client, event.channel, event.user);
  });


  listen('キャンセル', (client, event) => {
    leave(client, event.channel, event.user);
  });

  listen('ping', (client, event) => {
    client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: `pong!\n` + getChannelStateMessage(event.channel)
    })
  });

  listen('(ヘルプ|help)', (client, event) => {
    client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: getHelpMessage(event.channel)
    });
  })

  listen('status', (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: getChannelStateMessage(event.channel)
    });
  });

  listen('(終了|リセット|reset)', (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: `リセットします。直前の状態は以下のようになっていました\n` +
        getChannelStateMessage(event.channel)
    });
    abortSession(event.channel);
  });

  listen('(残りは[？?]?|あと誰[？?]?)', (client, event) => {
    if (!isStarted(event.channel)) {
      return;
    }
    const channelState = getChannelState(event.channel);
    if (channelState.waiting.length) {
      const remaining = channelState.waiting.map(_userId => `<@${_userId}>`).join(',');
      client.chat.postMessage({
        channel: event.channel,
        text:
          `:point_right: 残りは${remaining}です。\n` +
          `:fast_forward: 急用ができたら「 *@Shujinosuke キャンセル* 」もできます。\n` +
          `:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてくだFさい。`
      })
    } else {
      client.chat.postMessage({
        channel: event.channel,
        text: ":point_up: 今は全体連絡とレポートレビューの時間です。"
      })
    }
  });
  listen('check', (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: 'check'
    })
    sendReminderForJoin();
  });
}


declare const global: any;
global.doPost = doPost;
global.init = init;
global.sendReminderForEndSession = sendReminderForEndSession;
global.sendReminderForJoin = sendReminderForJoin;
global.endSession = endSession;
