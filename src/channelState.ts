import { CALL_REMINDER_SECONDS, CHECK_TIMEOUT_SECONDS, ENDING_PERIOD_SECONDS, getSlackClient, SlackClient } from './index'
import { getReadableTime } from './utilities';


interface ChannelState {
  waiting: string[],
  done: string[]
}

// TODO: 全体的に、状態の変更だけして、メッセージは呼び出し側で返り値によって制御する方が良いかも？

export const initialize = (channelId: string) => {
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

export const terminate = (channelId: string) => {
  deleteSessionChannelId();
  deleteChannelState(channelId);
  //TODO: 複数のチャンネルでShujinosukeを運用するのであれば、削除するTriggerを絞る必要がある
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  deleteSessionChannelId();
}

export const checkParticipants = async () => {
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


export const continueSession = () => {
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
    client.chat.postMessage({
      channel: sessionChannelId,
      text: `:fast_forward: 終了します。`
    })
  }
}

export const endSession = () => {
  const client = getSlackClient();
  const sessionChannelId = getSessionChannelId();
  if (getChannelState(sessionChannelId)) {
    terminate(sessionChannelId);
    client.chat.postMessage({
      channel: sessionChannelId,
      text: (
        `:stopwatch: 時間になりました！ みなさんご協力ありがとうございました。 :bow:\n` +
        `:rainbow: リフレッシュして、業務に戻りましょう！ :notes:`
      )
    });
  }
}


export const checkAllReported = (client: SlackClient, channelId: string) => {
  let channelState = getChannelState(channelId);
  if (channelState && channelState.waiting.length === 0) {
    ScriptApp.newTrigger(endSession.name)
      .timeBased()
      .after(ENDING_PERIOD_SECONDS * 1000)
      .create();
    client.chat.postMessage({
      channel: channelId,
      text: (
        `:+1: 全員のレポートが完了しました！` +
        `:stopwatch: それでは、${getReadableTime(ENDING_PERIOD_SECONDS)}ほど時間を取りますので、全体連絡のある方はお願いします。` +
        `eyes: また、この時間で皆さんのレポートを読んでコメントしましょう！（もちろん時間が過ぎたあとも続けて:ok:）`
      )
    })
  }
}


export const join = (client: SlackClient, channelId: string, userId: string) => {
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
}

export const leave = (client: SlackClient, channelId: string, userId: string) => {
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
}

export const makeDoneFromWaiting = async (channelId: string, userId: string): Promise<ChannelState | null> => {
  return new Promise((resolve) => {
    const channelState = getChannelState(channelId);
    let newChannelState = { ...channelState };
    if (!channelState) { resolve(channelState); }
    newChannelState.done.push(userId);
    newChannelState.waiting = channelState.waiting.filter((_userId) => {
      _userId !== userId
    });
    setChannelState(channelId, newChannelState);
    resolve(channelState);
  })
}

const initChannelState = (channelId: string) => {
  setChannelState(channelId, { waiting: [], done: [] });
}

const setChannelState = (channelId: string, newState: ChannelState) => {
  PropertiesService.getScriptProperties().setProperty(channelId, JSON.stringify(newState));
}

export const getChannelState = (channelId: string): ChannelState => {
  let channelState = JSON.parse(PropertiesService.getScriptProperties().getProperty(channelId));
  // ↑だけではなぜかstringのままになるのでJSON.parseもう１回（念の為while）
  while (typeof (channelState) === 'string') {
    channelState = JSON.parse(channelState);
  }
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