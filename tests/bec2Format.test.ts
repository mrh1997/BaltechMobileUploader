import { expect } from "chai";
import { describe, it } from "mocha";
import Bec2File from "~/bec2Format";

describe("Bec2File class", () => {
  it("should split header lines into keys and values", () => {
    const bec2File = Bec2File.parse("Key:Value");
    expect(bec2File.header).to.deep.equal({ Key: "Value" });
  });

  it("should trim white spaces from keys and values", () => {
    const bec2File = Bec2File.parse("  \t Key \t  :  \t Value \t  \n");
    expect(bec2File.header).to.deep.equal({ Key: "Value" });
  });

  it("should parse header with multiple colons in value correctly", () => {
    const bec2File = Bec2File.parse("Key:1 : 2 : 3");
    expect(bec2File.header).to.deep.equal({ Key: "1 : 2 : 3" });
  });

  it("should parse header with multiple entries", () => {
    const bec2File = Bec2File.parse("Key1:Value1\nKey2:Value2");
    expect(bec2File.header).to.deep.equal({ Key1: "Value1", Key2: "Value2" });
  });

  it("should raise exception on invalid header", () => {
    expect(() => Bec2File.parse("KeyValue")).to.throw();
  });

  it("should handle all sorts of newline character", () => {
    const bec2File = Bec2File.parse("K1:V\nK2:V\n\rK3:V\r");
    expect(bec2File.header).to.deep.equal({ K1: "V", K2: "V", K3: "V" });
  });

  it("should interpret hex string after empty line as content", () => {
    const bec2File = Bec2File.parse("Key:Value\n\n11AA");
    expect(bec2File.content).to.deep.equal([0x11, 0xaa]);
  });

  it("should join multiple hex lines into single content object", () => {
    const bec2File = Bec2File.parse("Key:Value\n\n\n11\n2233");
    expect(bec2File.content).to.deep.equal([0x11, 0x22, 0x33]);
  });

  it("should accept no header", () => {
    const bec2File = Bec2File.parse("\n1122");
    expect(bec2File.header).to.deep.equal({});
    expect(bec2File.content).to.deep.equal([0x11, 0x22]);
  });

  it("should accept multiple newlines as header/content delimiter", () => {
    const bec2File = Bec2File.parse("Key:Value\n\n\n1122");
    expect(bec2File.content).to.deep.equal([0x11, 0x22]);
  });

  it("should raise exception on invalid content character", () => {
    expect(() => Bec2File.parse("\n11xy")).to.throw();
  });

  it("should raise exception on uneven character count in content line", () => {
    expect(() => Bec2File.parse("\n123")).to.throw();
  });

  it("should raise exception on space in content line", () => {
    expect(() => Bec2File.parse("\n123")).to.throw();
  });
});
