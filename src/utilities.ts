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