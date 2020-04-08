const moment = require("moment");
moment.locale("ja");

const SLEEPING = "sleeping";
const STARTED = "started";
const CHECK_TIMEOUT_SECONDS = 120;
const ENDING_PERIOD_SECONDS = 300;
let state = {
  type: SLEEPING,
  members: {
    waiting: [],
    done: [],
  },
};

async function join(bot, message) {
  if (state.type == STARTED && message.user) {
    if (
      state.members.waiting.includes(message.user) ||
      state.members.done.includes(message.user)
    ) {
      await bot.replyEphemeral(message, "(大丈夫、参加済みですよ :+1:)");
    } else {
      state.members.waiting.push(message.user);
      await bot.reply(message, `:hand: <@${message.user}> が参加しました`);
    }
  }
}

module.exports = function (controller) {
  controller.hears(/開始/g, "direct_mention", async (bot, message) => {
    if (state.type === SLEEPING) {
      state.type = STARTED;
      setTimeout(async () => {
        await bot.changeContext(message.reference);
        controller.trigger("continue_session", bot, message);
      }, CHECK_TIMEOUT_SECONDS * 1000);
      const readable_check_timeout = moment
        .duration(CHECK_TIMEOUT_SECONDS, "seconds")
        .humanize();
      await bot.reply(message, {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `
:spiral_calendar_pad: 週次定例を始めます！
:mega: 参加者は「:rocket: 参加」ボタンをクリックか、「*@Shujinosuke 参加*」と返信！
:clipboard: 以下をコピーしてレポートをまとめ、できたらどんどん投稿しましょう！
:pencil: 「*@Shujinosuke レポート*」の部分も含めるようにお願いします。
:stopwatch: ${readable_check_timeout}ごとにリマインドしていきます。
`,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `
@Shujinosuke レポート
*先週から注力してうまくいったこと（＋新たな知見）*
...
*苦戦していること（助けがいる場合はその旨）*
...
*来週にかけて注力すること*
...
`,
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
      });
    }
  });

  controller.on("continue_session", async (bot, message) => {
    if (state.type === STARTED) {
      if (state.members.waiting.length > 0) {
        const remaining_count = state.members.waiting.length;
        setTimeout(async () => {
          await bot.changeContext(message.reference);
          controller.trigger("continue_session", bot, message);
        }, CHECK_TIMEOUT_SECONDS * 1000);
        await bot.say(`
:stopwatch: あと${remaining_count}人です。
:fast_forward: 「*@Shujinosuke レポート*」を含めて投稿してください！
`);
      } else if (state.members.done.length > 0) {
        // Do nothing; end_session timer should be working
      } else {
        // No participants
        state.type = SLEEPING;
        await bot.say(`
:fast_forward: 終了します。
`);
      }
    }
  });

  controller.on("end_session", async (bot, message) => {
    if (state.type === STARTED) {
      state.type = SLEEPING;
      state.members = { waiting: [], done: [] };
      await bot.say(`
:stopwatch: 時間になりました！ みなさんご協力ありがとうございました。 :bow:
:rainbow: リフレッシュして、業務に戻りましょう！ :notes:
`);
    }
  });

  controller.on("block_actions", async (bot, message) => {
    if (message.text === "join") {
      await join(bot, message);
    }
  });

  controller.hears("参加", "direct_mention", async (bot, message) => {
    await join(bot, message);
  });

  controller.hears(
    /レポート/g,
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED) {
        state.members.done.push(message.user);
        state.members.waiting = state.members.waiting.filter(
          (value, _index, _array) => value !== message.user
        );
        await bot.replyInThread(
          message,
          `
:+1: ありがとうございます！
:pencil: 皆さんコメントや質問をどうぞ！
(チャンネルを読みやすく保つため、「以下にも投稿する：<#${message.channel}>」は使わないようにお願いします)
`
        );
        if (state.members.waiting.length === 0) {
          await bot.changeContext(message.reference);
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
:eyes: また、この時間で皆さんのレポートを読んでコメントしましょう！（もちろん時間が過ぎたあとも続けて:ok:）
`);
        }
      }
    }
  );

  controller.hears(
    /キャンセル/g,
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED) {
        state.members.waiting = state.members.waiting.filter(
          (value, _index, _array) => value !== message.user
        );
        await bot.reply(
          message,
          `:wave: <@${message.user}> がキャンセルしました`
        );
      }
    }
  );

  controller.hears(/誰/g, "direct_mention,mention", async (bot, message) => {
    if (state.type === STARTED) {
      if (state.members.waiting.length > 0) {
        const remaining = state.members.waiting
          .map((value, _index, _array) => `<@${value}>`)
          .join(", ");
        await bot.say(`
:point_right: 残りは${remaining}です。
:fast_forward: 急用ができたら「*@Shujinosuke キャンセル*」もできます。
`);
      } else {
        await bot.say(":point_up: 今は全体連絡とレポートレビューの時間です。");
      }
    }
  });

  controller.hears(
    /終了|リセット|reset/g,
    "direct_mention",
    async (bot, message) => {
      const state_dump = JSON.stringify(state, null, 2);
      state = {
        type: SLEEPING,
        members: { waiting: [], done: [] },
      };
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

  controller.hears(
    "ping",
    "direct_mention,direct_message",
    async (bot, message) => {
      await bot.replyEphemeral(
        message,
        `
pong!
\`\`\`
${JSON.stringify(state, null, 2)}
\`\`\`
`
      );
    }
  );
};
