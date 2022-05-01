export type Content = string;
export type ContentHandler = (c: Content) => void;

let content: Content | null;
let contentHandler: ContentHandler | null;

export function _callContentHandler() {
  if (content && contentHandler) {
    contentHandler(content);
    content = null;
  }
}

export function _resetContentHandler() {
  contentHandler = null;
}

export function registerContentHandler(newHandler: ContentHandler) {
  contentHandler = newHandler;
  _callContentHandler();
}

export function _setContent(newContent: Content) {
  content = newContent;
}
