export enum SendResult {
  Ok,
  ServerFailure,
  NetworkFailure = 2,
}

export async function sendBugReport(
  title: string,
  fields: { [fnm: string]: string }
): Promise<SendResult> {
  return SendResult.Ok;
}
