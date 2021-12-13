import { knownFolders } from "@nativescript/core/file-system";

export async function readFile(fileName: string): Promise<string | null> {
  const docsFolder = knownFolders.documents();
  if (!docsFolder.contains(fileName)) return null;
  else return await docsFolder.getFile(fileName).readText();
}

export async function writeFile(
  fileName: string,
  content: string
): Promise<void> {
  const docsFolder = knownFolders.documents();
  return await docsFolder.getFile(fileName).writeText(content);
}
