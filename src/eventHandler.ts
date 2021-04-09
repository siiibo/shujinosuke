import { SlackEvent, GenericMessageEvent, AppMentionEvent, EmojiChangedEvent } from '@slack/bolt'
import { join, leave, initialize, terminate } from "./channelState";
import { checkAllReported, makeDoneFromWaiting, getChannelState } from "./channelState";
import { checkParticipants } from './channelState'
import { CHECK_TIMEOUT_SECONDS, EMOJI_EVENT_POST_CHANNEL, SlackClient } from './index';
import { getReadableTime } from './utilities'

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


export const handleSlackEvent = (client: SlackClient, event: SlackEvent) => {
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


export const handleMessageEvent = (client: SlackClient, event: GenericMessageEvent) => {
  // subtypeで処理わけ
  const isBot = (event: GenericMessageEvent) => {
    // botからのメッセージのTypeは、公式でまだ未対応 https://github.com/slackapi/bolt-js/issues/580
    return 'bot_id' in event;
  }
}


export const handleAppMention = (slackClient: SlackClient, appMentionEvent: AppMentionEvent) => {
  const listen = getListen(slackClient, appMentionEvent);

  listen(/^開始$/, (client, event) => {
    if (!getChannelState(event.channel)) {
      initialize(event.channel);
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
                `:stopwatch: ${getReadableTime(CHECK_TIMEOUT_SECONDS)}後にリマインドし、全員投稿したら全体連絡の時間に移ります。\n` +
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
    const channelState = await makeDoneFromWaiting(event.channel, event.user);
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
    terminate(event.channel);
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
