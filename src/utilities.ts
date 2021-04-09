export const getReadableTime = (secondsArg: number) => {
  const minutes = Math.floor(secondsArg / 60);
  const seconds = secondsArg % 60;
  if (seconds === 0) {
    return `${Math.floor(secondsArg / 60)}分`;
  } else {
    if (minutes === 0) {
      return `${(secondsArg % 60).toString().padStart(2, '0')}秒`;
    } else {
      return `${Math.floor(secondsArg / 60)}分${(secondsArg % 60).toString().padStart(2, '0')}秒`;
    }
  }
}

export const isJson = (e: GoogleAppsScript.Events.DoPost) => {
  return e.postData.type === 'application/json';
}

export const isUrlVerification = (e: GoogleAppsScript.Events.DoPost) => {
  if (isJson(e) && e.postData.contents) {
    return (JSON.parse(e.postData.contents).type === 'url_verification');
  } else {
    return false;
  }
}

export const isAction = (e: GoogleAppsScript.Events.DoPost) => {
  // TODO: payload.typeがaction_blocksかinteractive_messageかである必要
  return e.parameter.hasOwnProperty('payload');
}

export const isEvent = (e: GoogleAppsScript.Events.DoPost) => {
  if (isJson(e) && e.postData.contents) {
    return JSON.parse(e.postData.contents).hasOwnProperty('event');
  } else {
    return false;
  }
}