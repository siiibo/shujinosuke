const moment = require("moment");
moment.locale("ja");

const SLEEPING = "sleeping";
const STARTED = "started";
const CHECK_TIMEOUT_SECONDS = 1200;
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

async function check_all_reported(controller, bot, message) {
  if (state.type === STARTED && state.members.waiting.length === 0) {
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

module.exports = function (controller) {
  // Message patterns should basically come first.

  // Pickup reports. This is the most prioritized pattern in the session.
  controller.hears(
    [
      /^レポート/,
      /<@U010MMQGD96> +レポート/,
      /先週から注力してうまくいったこと/,
      /苦戦していること/,
      /来週にかけて注力すること/,
    ],
    "direct_mention,mention,message",
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
        await check_all_reported(controller, bot, message);
      }
    }
  );

  controller.hears(/^参加$/, "direct_mention", async (bot, message) => {
    await join(bot, message);
  });

  controller.hears(/^キャンセル$/, "direct_mention", async (bot, message) => {
    if (state.type === STARTED) {
      state.members.waiting = state.members.waiting.filter(
        (value, _index, _array) => value !== message.user
      );
      await bot.reply(
        message,
        `:wave: <@${message.user}> がキャンセルしました`
      );
      await check_all_reported(controller, bot, message);
    }
  });

  controller.hears(/誰？?$/, "direct_mention", async (bot, message) => {
    if (state.type === STARTED) {
      if (state.members.waiting.length > 0) {
        const remaining = state.members.waiting
          .map((value, _index, _array) => `<@${value}>`)
          .join(", ");
        await bot.say(`
:point_right: 残りは${remaining}です。
:fast_forward: 急用ができたら「 *@Shujinosuke キャンセル* 」もできます。
:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてください。
`);
      } else {
        await bot.say(":point_up: 今は全体連絡とレポートレビューの時間です。");
      }
    }
  });

  controller.hears(
    /^(終了|リセット|reset)$/,
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

  controller.hears(/^status$/, "direct_mention", async (bot, message) => {
    await bot.say(`
\`\`\`
${JSON.stringify(state, null, 2)}
\`\`\`
`);
  });

  controller.hears(
    /^ping$/,
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

  controller.hears(/^開始$/, "direct_mention", async (bot, message) => {
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
:mega: 参加者は「:rocket: 参加」ボタンをクリックか、「 *@Shujinosuke 参加* 」と返信！
:clipboard: 以下をコピーしてレポートをまとめ、できたらどんどん投稿しましょう！
:stopwatch: ${readable_check_timeout}後にリマインドし、全員投稿したら全体連絡の時間に移ります。
:question: 私がちゃんと反応しなかった場合、投稿を一度削除して投稿し直してみてください。
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
        await bot.say(`
:stopwatch: あと${remaining_count}人です。全体連絡を先に始めていてもOKです。
:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてください。
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
};
