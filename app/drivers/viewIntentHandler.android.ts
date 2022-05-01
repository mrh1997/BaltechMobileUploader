export type { Content, ContentHandler } from "./viewIntentHandler.common";
export { registerContentHandler } from "./viewIntentHandler.common";

import * as application from "@nativescript/core/application";
import {
  _resetContentHandler,
  _setContent,
  _callContentHandler,
} from "./viewIntentHandler.common";

application.ensureNativeApplication();
application.android.on("activityDestroyed", _resetContentHandler);
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
      _setContent(lines.join("\n"));
    } catch (e) {
      throw new Error("Failed to fetch content from other App");
    }
    _callContentHandler();
  }
});
