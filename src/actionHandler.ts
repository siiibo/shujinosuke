import { SlackAction, BlockAction, ButtonAction } from '@slack/bolt'
import { join } from './channelState';


export const handleSlackAction = (client, payload: SlackAction) => {
  switch (payload.type) {
    case 'block_actions':
      handleBlockAction(client, payload)
  }
}

export const handleBlockAction = (client, payload: BlockAction) => {
  const buttons = payload.actions.filter(action => action.type === 'button') as ButtonAction[];
  if ('join' in buttons.map(action => action.value)) {
    join(client, payload.channel.id, payload.user.id);
  }
}

