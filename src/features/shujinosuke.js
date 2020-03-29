const moment = require("moment");
moment.locale("ja");

const SLEEPING = "sleeping";
const STARTING = "starting";
const STARTED = "started";
const DEFAULT_STARTING_PERIOD_SECONDS = 300;
const COMMENT_PERIOD_SECONDS = 120;
const ENDING_PERIOD_SECONDS = 300;
const INITIAL_STATE = {
  type: SLEEPING,
  members: {
    waiting: [],
    assigned: null,
    done: []
  }
};
let state = INITIAL_STATE;

async function join(bot, message) {
  if ([STARTING, STARTED].includes(state.type) && message.user) {
    if (
      state.members.waiting.includes(message.user) ||
      state.members.done.includes(message.user) ||
      state.members.assigned === message.user
    ) {
      await bot.replyEphemeral(message, "(大丈夫、参加済みですよ :+1:)");
    } else {
      state.members.waiting.push(message.user);
      await bot.reply(message, `:hand: <@${message.user}> が参加しました`);
    }
  }
}

module.exports = function(controller) {
  controller.hears(/開始/g, "direct_mention", async (bot, message) => {
    if (state.type === SLEEPING) {
      state.type = STARTING;
      const matches = message.text.match(/(\d+)分後/m);
      const starting_period_seconds =
        (matches && parseInt(matches[1]) * 60) || // If matched, matches[0] has whole matched segment
        DEFAULT_STARTING_PERIOD_SECONDS;
      setTimeout(async () => {
        await bot.changeContext(message.reference);
        controller.trigger("continue_session", bot, message);
      }, starting_period_seconds * 1000);
      const readable_starting_period = moment
        .duration(starting_period_seconds, "seconds")
        .humanize();
      await bot.reply(message, {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `
:spiral_calendar_pad: ${readable_starting_period}後に週次定例を始めます。
:mega: 参加者は「:rocket: 参加」ボタンをクリックか、"@Shujinosuke 参加"と返信！
:clipboard: 以下をコピーしてレポートを下書きしてください！ 始まったら指名していきます。
`
            }
          },
          {
            type: "divider"
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `
*先週から注力してうまくいったこと（＋新たな知見）*
...
*苦戦していること（助けがいる場合はその旨）*
...
*来週にかけて注力すること*
...
`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: ":rocket: 参加",
                  emoji: true
                },
                value: "join"
              }
            ]
          }
        ]
      });
    }
  });

  controller.on("continue_session", async (bot, message) => {
    state.members.assigned = state.members.waiting.shift();
    if (state.members.assigned) {
      state.type = STARTED;
      await bot.say(`
:stopwatch: 時間になりました。では<@${state.members.assigned}>お願いします！
:fast_forward: "@Shujinosuke スキップ" で後回しにもできます。
`);
    } else {
      setTimeout(async () => {
        await bot.changeContext(message.reference);
        controller.trigger("end_session", bot, message);
      }, ENDING_PERIOD_SECONDS * 1000);
      const readable_ending_period = moment
        .duration(ENDING_PERIOD_SECONDS, "seconds")
        .humanize();
      await bot.say(`
:+1: 全員のレポートが完了しました！
:stopwatch: それでは、${readable_ending_period}ほど時間を取りますので、全体連絡のある方はお願いします。
:eyes: まだ読み終わっていないレポートがあれば、読んでコメントしましょう！
`);
    }
  });

  controller.on("end_session", async (bot, message) => {
    state = INITIAL_STATE;
    await bot.say(`
:stopwatch: 時間になりました！ みなさんご協力ありがとうございました。 :bow:
:rainbow: リフレッシュして、業務に戻りましょう！ :notes:
`);
  });

  controller.on("block_actions", async (bot, message) => {
    if (message.text === "join") {
      await join(bot, message);
    }
  });

  controller.hears("参加", "direct_mention", async (bot, message) => {
    await join(bot, message);
  });

  controller.on("message", async (bot, message) => {
    if (
      state.type === STARTED &&
      message.user === state.members.assigned &&
      !message.text.match(/スキップ/)
    ) {
      state.members.done.push(state.members.assigned);
      state.members.assigned = undefined;
      setTimeout(async () => {
        await bot.changeContext(message.reference);
        controller.trigger("continue_session", bot, message);
      }, COMMENT_PERIOD_SECONDS * 1000);
      const readable_comment_period = moment
        .duration(COMMENT_PERIOD_SECONDS, "seconds")
        .humanize();
      await bot.replyInThread(
        message,
        `
:+1: ありがとうございます！
:pencil: ${readable_comment_period}ほど時間を取ります。皆さんコメントや質問をどうぞ！
(時間が来たあとも続けて構いません)
(チャンネルを読みやすく保つため、「以下にも投稿する：<#${message.channel}>」は使わないようにお願いします)
`
      );
    }
  });

  controller.hears(
    /スキップ/g,
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED && state.members.assigned) {
        state.members.waiting.push(state.members.assigned);
        state.members.assigned = state.members.waiting.shift();
        await bot.say(`
:ok: では<@${state.members.assigned}>お願いします！
`);
      }
    }
  );

  controller.hears(/誰/g, "direct_mention,mention", async (bot, message) => {
    if (state.type === STARTED) {
      if (state.members.assigned) {
        await bot.say(`
:point_right: 今は<@${state.members.assigned}>の番です。
:fast_forward: "@Shujinosuke スキップ" で後回しにもできます。
`);
      } else {
        const latest_assigned = state.members.done.slice(-1)[0];
        const next_up = state.members.waiting[0];
        if (latest_assigned) {
          if (next_up) {
            await bot.say(`
:point_up: 今は<@${latest_assigned}>のレポートをみんなで読んでいます。
:point_down: 次は<@${next_up}>なので準備お願いします。
`);
          } else {
            await bot.say(
              `:point_up: 今は<@${latest_assigned}>のレポートをみんなで読んでいます。`
            );
          }
        } else if (next_up) {
          await bot.say(
            `:point_down: 最初は<@${next_up}>なので準備お願いします。`
          );
        }
      }
    }
  });

  controller.hears(
    /終了|リセット|reset/g,
    "direct_mention",
    async (bot, message) => {
      const state_dump = JSON.stringify(state, null, 2);
      state = INITIAL_STATE;
      await bot.say(`
リセットします。直前の状態は以下のようになっていました:
\`\`\`
${state_dump}
\`\`\`
`);
    }
  );

  controller.hears("status", "direct_mention", async (bot, message) => {
    await bot.say(`
\`\`\`
${JSON.stringify(state, null, 2)}
\`\`\`
`);
  });
};
