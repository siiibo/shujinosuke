import { SlackAction, BlockAction, ButtonAction } from '@slack/bolt'
import { join } from './channelState';

export const isAction = (e: GoogleAppsScript.Events.DoPost) => {
  // TODO: payload.typeがaction_blocksかinteractive_messageかである必要
  return e.parameter.hasOwnProperty('payload');
}

export const handleSlackAction = (client, payload: SlackAction) => {
  console.log(payload);
  switch (payload.type) {
    case 'block_actions':
      handleBlockAction(client, payload)
  }
}

export const handleBlockAction = (client, payload: BlockAction) => {
  const buttons = payload.actions.filter(action => action.type === 'button') as ButtonAction[];

  console.log(buttons);
  if ('join' in buttons.map(action => action.value)) {
    join(client, payload.channel.id, payload.user.id);
  }
}

