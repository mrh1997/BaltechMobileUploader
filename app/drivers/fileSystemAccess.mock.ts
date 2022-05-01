let fileSystem = {};

export async function readFile(fileName: string): Promise<string | null> {
  return fileSystem[fileName];
}

export async function writeFile(
  fileName: string,
  content: string
): Promise<void> {
  fileSystem[fileName] = content;
}
