import * as application from "@nativescript/core/application";

export type Content = string;
export type ContentHandler = (Content) => void;

let content: Content;
let contentHandler: ContentHandler;

function callContentHandler() {
  if (content && contentHandler) {
    contentHandler(content);
    content = null;
  }
}

export default function registerContentHandler(newHandler: ContentHandler) {
  contentHandler = newHandler;
  callContentHandler();
}

application.android.on("activityDestroyed", (data) => {
  contentHandler = null;
});
application.android.on("activityNewIntent", (data) => {
  if (data.intent.getAction() == "android.intent.action.VIEW") {
    const firmware = [];
    try {
      const uri = data.intent.getData();
      const contentResolver = application.android.context.getContentResolver();
      const strm = contentResolver.openInputStream(uri);
      const r = new java.io.BufferedReader(new java.io.InputStreamReader(strm));
      const lines = [];
      for (let line = r.readLine(); line != null; line = r.readLine())
        lines.push(line);
      content = lines.join("\n");
    } catch (e) {
      throw new Error("Failed to fetch content from other App");
    }
    callContentHandler();
  }
});
