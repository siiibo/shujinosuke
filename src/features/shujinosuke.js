const moment = require("moment");
moment.locale("ja");

const SLEEPING = "sleeping";
const STARTING = "starting";
const STARTED = "started";
const DEFAULT_STARTING_PERIOD_SECONDS = 300;
const COMMENT_PERIOD_SECONDS = 10;
let state = {
  type: SLEEPING,
  starting_period_seconds: DEFAULT_STARTING_PERIOD_SECONDS,
  members: {
    waiting: [],
    assigned: null,
    done: []
  }
};

module.exports = function(controller) {
  controller.ready(async () => {
    if (process.env.MYTEAM) {
      let bot = await controller.spawn(process.env.MYTEAM);
      await bot.startConversationInChannel(
        process.env.MYCHAN,
        process.env.MYUSER
      );
      await bot.say("復帰しました〜");
    }
  });

  controller.hears("開始", "direct_mention", async (bot, message) => {
    if (state.type === SLEEPING) {
      state.type = STARTING;
      setTimeout(async () => {
        await bot.changeContext(message.reference);
        controller.trigger("continue_session", bot, message);
      }, state.starting_period_seconds * 1000);
      const readable_starting_period = moment
        .duration(state.starting_period_seconds, "seconds")
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
:writing_hand: 各自レポートを下書きしておいてください！ 始まったら指名していきます。
(:warning: ちなみに私は物覚えが悪いので、妙な操作をされると記憶をなくします :boom:)
`
            }
          },
          {
            type: "divider"
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
:pencil: "@Shujinosuke レポート: 今週は……" のように「レポート」という単語を含めて私に返信してください。
:fast_forward: "@Shujinosuke スキップ" で後回しにもできます。
`);
    } else {
      state = Object.assign(state, {
        type: SLEEPING,
        members: { waiting: [], assigned: null, done: [] }
      });
      await bot.say(
        ":rainbow: みなさんありがとうございました。今週も頑張っていきましょう！ :notes:"
      );
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
    new RegExp("レポート"),
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED && message.user === state.members.assigned) {
        state.members.done.push(state.members.assigned);
        state.members.assigned = undefined;
        setTimeout(async () => {
          await bot.changeContext(message.reference);
          controller.trigger("continue_session", bot);
        }, COMMENT_PERIOD_SECONDS * 1000);
        await bot.replyInThread(
          message,
          `
:+1: ありがとうございます！
:pencil: ${COMMENT_PERIOD_SECONDS}秒ほど時間を取ります。皆さんコメントや質問をどうぞ！
(時間が来たあとも続けて構いません)
`
        );
      }
    }
  );

  controller.hears(
    "スキップ",
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED && state.members.assigned) {
        state.members.waiting.push(state.members.assigned);
        state.members.assigned = state.members.waiting.shift();
        await bot.say(`
:ok: では<@${state.members.assigned}>お願いします！
:pencil: "@Shujinosuke レポート: 今週は……" のように「レポート」という単語を含めて私に返信してください。
`);
      }
    }
  );

  controller.hears(
    new RegExp("誰"),
    "direct_mention,mention",
    async (bot, message) => {
      if (state.type === STARTED && state.members.assigned) {
        await bot.say(`
:point_right: 今は<@${state.members.assigned}>の番です。
:pencil: "@Shujinosuke レポート: 今週は……" のように「レポート」という単語を含めて私に返信してください。
:fast_forward: "@Shujinosuke スキップ" で後回しにもできます。
`);
      }
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
