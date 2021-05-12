import { SlackEvent, AppMentionEvent, EmojiChangedEvent, GenericMessageEvent } from '@slack/bolt'
import { SlackAction, BlockAction, ButtonAction } from '@slack/bolt'
import { GasWebClient as SlackClient } from '@hi-se/web-api';

import moment from 'moment';
moment.locale('ja');

const TOKEN_SHEET_ID = '1ExiQonKpf2T8NnR9YFMzoD7jobHEuAXUUq3vaBL0hW8';
const EMOJI_EVENT_POST_CHANNEL = "C011BG29K71" // #雑談
const CHECK_TIMEOUT_SECONDS = 1200;
const ENDING_PERIOD_SECONDS = 300;
const CALL_REMINDER_SECONDS = 180;
const LOCK_TIMEOUT_SECONDS = 10;


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


const initializeSession = (channelId: string) => {
  setSessionChannelId(channelId);
  initChannelState(channelId);
  ScriptApp.newTrigger(checkParticipants.name)
    .timeBased()
    .after(CALL_REMINDER_SECONDS * 1000)
    .create();
  ScriptApp.newTrigger(continueSession.name)
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

const checkParticipants = async () => {
  const exceptions = ["U010MMQGD96", "UU8H6MKEU"]; //Shujinosuke and observers
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  const channelState = getChannelState(sessionChannelId);
  const channelMembers = (await client.conversations.members({
    channel: sessionChannelId
  })).members.filter(userId => !exceptions.includes(userId));
  const remindTargets = channelMembers.filter(userId => {
    return (
      !channelState.done.includes(userId) &&
      !channelState.waiting.includes(userId)
    )
  });
  remindTargets.forEach(async (remindTarget) => {
    if ((await client.users.getPresence({ user: remindTarget })).presence === 'active') {
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


const continueSession = () => {
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  const channelState = getChannelState(sessionChannelId);
  if (channelState?.waiting.length) {
    client.chat.postMessage({
      channel: sessionChannelId,
      text: (
        `:stopwatch: あと${channelState.waiting.length}人です。全体連絡を先に始めていてもOKです。\n` +
        `:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてください。`
      )
    })
  } else {
    abortSession(sessionChannelId);
    client.chat.postMessage({
      channel: sessionChannelId,
      text: `:fast_forward: 終了します。`
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
        `:eyes: また、この時間で皆さんのレポートを読んでコメントしましょう！（もちろん時間が過ぎたあとも続けて:ok:）`
      )
    })
  }
}


const join = (client: SlackClient, channelId: string, userId: string) => {
  const scriptLock = LockService.getScriptLock();
  try {
    scriptLock.waitLock(LOCK_TIMEOUT_SECONDS * 1000)
    const channelState = getChannelState(channelId);
    let newChannelState = { ...channelState };
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
      newChannelState.waiting.push(userId);
      setChannelState(channelId, newChannelState);
      client.chat.postMessage({ channel: channelId, text: `:hand: <@${userId}> が参加しました` });
    }

  } catch (e) {
    console.error(e);
  } finally {
    scriptLock.releaseLock();
  }
}

const leave = (client: SlackClient, channelId: string, userId: string) => {
  const scriptLock = LockService.getScriptLock();
  try {
    const channelState: ChannelState = getChannelState(channelId);
    let newChannelState: ChannelState = { ...channelState }
    if (!channelState) {
      client.chat.postMessage({ channel: channelId, text: 'no channel state' });
      return;
    }
    if (channelState.waiting.includes(userId)) {
      newChannelState.waiting = channelState.waiting.filter((_userId) => {
        return _userId !== userId
      });
      setChannelState(channelId, newChannelState);
      client.chat.postMessage({ channel: channelId, text: `:wave: <@${userId}> がキャンセルしました` });
      checkAllReported(client, channelId);
    }
  } catch (e) {
    console.error(e);
  } finally {
    scriptLock.releaseLock();
  }
}

const makeDoneFromWaiting = (channelId: string, userId: string): ChannelState | undefined => {
  const scriptLock = LockService.getScriptLock();
  try {
    const channelState = getChannelState(channelId);
    let newChannelState = { ...channelState };
    if (!channelState) { return; }
    newChannelState.done.push(userId);
    newChannelState.waiting = channelState.waiting.filter((_userId) => {
      return _userId !== userId
    });
    setChannelState(channelId, newChannelState);
    return newChannelState;
  } catch (e) {
    console.error(e);
  } finally {
    scriptLock.releaseLock();
  }
}

const initChannelState = (channelId: string) => {
  setChannelState(channelId, { waiting: [], done: [] });
}

const setChannelState = (channelId: string, newState: ChannelState) => {
  PropertiesService.getScriptProperties().setProperty(channelId, JSON.stringify(newState));
}

const getChannelState = (channelId: string): ChannelState => {
  let channelState = JSON.parse(PropertiesService.getScriptProperties().getProperty(channelId));
  return channelState;
}

const deleteChannelState = (channelId: string) => {
  if (getChannelState(channelId)) {
    PropertiesService.getScriptProperties().deleteProperty(channelId);
    return true;
  } else {
    return false;
  }
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
    レポート未投稿者の確認: "`誰？` `残りは？`",
    Botステータスの確認: "`status`",
    ping: "`ping`",
    ヘルプ: "`ヘルプ` `help`",
    アクティブメンバーの確認: "`誰いる？` `今いる人は？`",
  };

  const channelState = getChannelState(channelId);
  if (channelState) {
    const commands = Object.entries(helpCommandsInWaiting)
      .map(([command, explanation]) => command + "\n" + explanation)
      .join("\n\n");
    return (
      `:books:会議開始前にShujinosukeで使えるコマンドは以下の通りです！\n` +
      `:bulb:コマンドの前には必ず "@Shujinosuke" をつけましょう！\n\n` +
      `${commands}`
    );
  } else {
    const commands = Object.entries(helpCommandsInMeeting)
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

const getListen = (client: SlackClient, event: SlackEvent) => {
  switch (event.type) {
    case 'app_mention':
      return (regExp: RegExp, callback: (client: SlackClient, event: AppMentionEvent) => void) => {
        const messageContent = event.text.replace(/^<@\w+>\s*/, '');
        if (messageContent.match(regExp)) {
          callback(client, event);
        }
      }
  }
}
const getThreadTs = (event: GenericMessageEvent | AppMentionEvent) => {
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
    case 'emoji_changed':
      handleEmojiChange(client, event as EmojiChangedEvent);
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

  listen(/^開始$/, (client, event) => {
    if (!getChannelState(event.channel)) {
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
                `:stopwatch: ${readableCheckTimeout}後にリマインドし、全員投稿したら全体連絡の時間に移ります。\n` +
                `:question: 私がちゃんと反応しなかった場合、投稿を一度削除して投稿し直してみてください。\n` +
                `:google: こちらのMeetに参加しておしゃべりもどうぞ！ https://meet.google.com/gsa-wivy-jnu`,
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

  listen(/^レポート|調子、出来事、悩み等/, async (client, event) => {
    const channelState = makeDoneFromWaiting(event.channel, event.user);
    if (channelState) {
      client.chat.postMessage({
        channel: event.channel,
        thread_ts: getThreadTs(event),
        text: `` +
          `:+1: ありがとうございます！\n` +
          `:pencil: 皆さんコメントや質問をどうぞ！\n` +
          `(チャンネルを読みやすく保つため、「以下にも投稿する：<#${event.channel}>」は使わないようにお願いします)`
      });
      checkAllReported(client, event.channel);
    }
  });

  listen(/参加/, (client, event) => {
    join(client, event.channel, event.user);
  });


  listen(/^キャンセル$/, (client, event) => {
    leave(client, event.channel, event.user);
  });

  listen(/^ping$/i, (client, event) => {
    client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: `pong!\n` + getChannelStateMessage(event.channel)
    })
  });

  listen(/^(ヘルプ|help)$/i, (client, event) => {
    client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      text: getHelpMessage(event.channel)
    });
  })

  listen(/^status$/i, (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: getChannelStateMessage(event.channel)
    });
  });

  listen(/^(終了|リセット|reset)$/i, (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: `リセットします。直前の状態は以下のようになっていました\n` +
        getChannelStateMessage(event.channel)
    });
    abortSession(event.channel);
  });

  listen(/(^残りは[？?]?|誰[？?]?$)/, (client, event) => {
    const channelState = getChannelState(event.channel);
    if (channelState) {
      if (channelState.waiting) {
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
    }
  });
  listen(/^check/, (client, event) => {
    client.chat.postMessage({
      channel: event.channel,
      text: 'check'
    })
    checkParticipants();
  })
}


const handleEmojiChange = (client: SlackClient, event: EmojiChangedEvent) => {
  if (event.subtype === 'add') {
    client.chat.postMessage({
      channel: EMOJI_EVENT_POST_CHANNEL,
      text: `:${event.name}:  (\`:${event.name}:\`)が追加されました！`
    });
  }
}


declare const global: any;
global.doPost = doPost;
global.init = init;
global.continueSession = continueSession;
global.checkParticipants = checkParticipants;
global.endSession = endSession;
