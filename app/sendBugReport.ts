import { Http, HttpResponse } from "@nativescript/core";

export async function sendBugReport(
  title: string,
  fields: { [fnm: string]: string }
) {
  let fieldsWithDollarPrefix = {};
  for (let [k, v] of Object.entries(fields))
    fieldsWithDollarPrefix["$" + k] = v;

  return await Http.request({
    url: "https://api.staticforms.xyz/submit",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    content: JSON.stringify({
      subject: title,
      accessKey: "3c01062e-85d1-40bf-9129-33fa552bc6c6", // bugreport@baltech.de
      ...fieldsWithDollarPrefix,
    }),
  });
}
