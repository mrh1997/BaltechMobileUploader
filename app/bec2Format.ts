export default class Bec2File {
  header: object = {};
  content: number[] = [];

  static BEC2LINE_PATTERN = /^([0-9a-fA-F]{2})+$/;

  static parse(bec2Content: string): Bec2File {
    const bec2File = new Bec2File();
    const bec2Lines = bec2Content.split(/\n\r|\n|\r/);
    let inHeader = true;
    bec2Lines.forEach((bec2Line) => {
      if (bec2Line.trim() == "") inHeader = false;
      else if (inHeader) {
        const [key, ...valueParts] = bec2Line.split(":");
        if (valueParts.length == 0)
          throw new Error(`Missing ":" in header line "${bec2Line}"`);
        const value = valueParts.join(":").trim();
        bec2File.header[key.trim()] = value?.trim();
      } else {
        if (!Bec2File.BEC2LINE_PATTERN.test(bec2Line))
          throw new Error(`Invalid Line in BEC2 File: "${bec2Line}"`);
        for (let c = 0; c < bec2Line.length; c += 2) {
          const byte = parseInt(bec2Line.slice(c, c + 2), 16);
          bec2File.content.push(byte);
        }
      }
    });
    return bec2File;
  }
}
