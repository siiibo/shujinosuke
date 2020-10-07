const moment = require("moment");
moment.locale("ja");

const SLEEPING = "sleeping";
const STARTED = "started";
const CHECK_TIMEOUT_SECONDS = 1200;
const ENDING_PERIOD_SECONDS = 300;

let global_state = new Map();

const help_commands_off = {
  会議の開始: "`開始`",
  Botステータスの確認: "`status`",
  ping: "`ping`",
  ヘルプ: "`ヘルプ` `help`",
};
const help_commands_on = {
  レポートの投稿:
    "`レポート` `先週から注力してうまくいったこと`\n`苦戦していること` `来週にかけて注力すること`",
  会議の開始: "`開始`",
  会議の強制終了: "`終了` `リセット` `reset`",
  会議へ参加: "`参加`",
  参加の取り消し: "`キャンセル`",
  レポート未投稿者の確認: "`誰？`",
  Botステータスの確認: "`status`",
  ping: "`ping`",
  ヘルプ: "`ヘルプ` `help`",
};

function gen_help_message(message) {
  if (!global_state.has(message.channel)) {
    const commands = Object.entries(help_commands_off)
      .map(([key, val]) => key + "\n" + val)
      .join("\n\n");

    return (
      ':books:会議開始前にShujinosukeで使えるコマンドは以下の通りです！\n:bulb:コマンドの前には必ず "@Shujinosuke" をつけましょう！\n\n' +
      commands
    );
  } else if (global_state.has(message.channel)) {
    const commands = Object.entries(help_commands_on)
      .map((x) => "\n" + x[0] + "\n" + x[1])
      .join("\n");

    return (
      ':books:会議中にShujinosukeで使えるコマンドは以下の通りです！\n:bulb:コマンドの前には必ず "@Shujinosuke" をつけましょう！\n\n' +
      commands
    );
  }
}

async function join(bot, message) {
  if (global_state.has(message.channel) && message.user) {
    if (
      global_state.get(message.channel).waiting.includes(message.user) ||
      global_state.get(message.channel).done.includes(message.user)
    ) {
      await bot.replyEphemeral(message, "(大丈夫、参加済みですよ :+1:)");
    } else {
      global_state.get(message.channel).waiting.push(message.user);
      await bot.reply(message, `:hand: <@${message.user}> が参加しました`);
    }
  }
}

async function check_all_reported(controller, bot, message) {
  if (
    global_state.has(message.channel) &&
    global_state.get(message.channel).waiting.length === 0
  ) {
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
      if (global_state.has(message.channel)) {
        global_state.get(message.channel).done.push(message.user);
        global_state.get(message.channel).waiting = global_state
          .get(message.channel)
          .waiting.filter((value, _index, _array) => value !== message.user);
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
    if (global_state.has(message.channel)) {
      global_state.get(message.channel).waiting = global_state
        .get(message.channel)
        .waiting.filter((value, _index, _array) => value !== message.user);
      await bot.reply(
        message,
        `:wave: <@${message.user}> がキャンセルしました`
      );
      await check_all_reported(controller, bot, message);
    }
  });

  controller.hears(/誰？$/, "direct_mention", async (bot, message) => {
    if (global_state.has(message.channel)) {
      if (global_state.get(message.channel).waiting.length > 0) {
        const remaining = global_state
          .get(message.channel)
          .waiting.map((value, _index, _array) => `<@${value}>`)
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
      const state_dump = JSON.stringify(Array.from(global_state), null, 2);
      global_state.delete(message.channel);
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
${JSON.stringify(Array.from(global_state), null, 2)}
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
${JSON.stringify(Array.from(global_state), null, 2)}
\`\`\`
`
      );
    }
  );

  controller.hears(/^開始$/, "direct_mention", async (bot, message) => {
    if (!global_state.has(message.channel)) {
      global_state.set(message.channel, { waiting: [], done: [] });
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

  controller.hears(
    /^(ヘルプ|help)$/,
    "direct_mention",
    async (bot, message) => {
      let message_txt = gen_help_message(message);
      await bot.reply(message, message_txt);
    }
  );

  controller.on("continue_session", async (bot, message) => {
    if (global_state.has(message.channel)) {
      if (global_state.get(message.channel).waiting.length > 0) {
        const remaining_count = global_state.get(message.channel).waiting
          .length;
        await bot.say(`
:stopwatch: あと${remaining_count}人です。全体連絡を先に始めていてもOKです。
:question: 私がちゃんと反応しなかった場合、削除して投稿し直してみてください。
`);
      } else if (global_state.get(message.channel).done.length > 0) {
        // Do nothing; end_session timer should be working
      } else {
        // No participants
        await bot.say(`
:fast_forward: 終了します。
`);
      }
    }
  });

  controller.on("end_session", async (bot, message) => {
    if (global_state.delete(message.channel)) {
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
