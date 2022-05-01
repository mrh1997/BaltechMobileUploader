export enum SendResult {
  Ok,
  ServerFailure,
  NetworkFailure = 2,
}

export async function sendBugReport(
  title: string,
  fields: { [fnm: string]: string }
): Promise<SendResult> {
  let fieldsWithDollarPrefix = {};
  for (let [k, v] of Object.entries(fields))
    fieldsWithDollarPrefix["$" + k] = v;

  try {
    const response = await fetch("https://api.staticforms.xyz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: title,
        accessKey: "3c01062e-85d1-40bf-9129-33fa552bc6c6", // bugreport@baltech.de
        ...fieldsWithDollarPrefix,
      }),
    });
    if (response.ok) return SendResult.Ok;
    else return SendResult.ServerFailure;
  } catch (e) {
    return SendResult.NetworkFailure;
  }
}
