import { expect } from "chai";
import { describe, it } from "mocha";
import {
  Bec2OverNfcSession,
  ReaderInfo,
  FinishCode,
} from "../app/bec2OverNfcSession";

describe("Bec2OverNfcSession", () => {
  let sentReaderInfo: ReaderInfo;
  let sentFinishCode: FinishCode;
  let sentProgress: number;
  let sentBytes: number;
  let bec2Sess: Bec2OverNfcSession;

  const apdu_SELECT_DF = [0x00, 0xa4, 0x04, 0x0c, 0x10]
    .concat([0xf1, 0x42, 0x61, 0x6c, 0x74, 0x65, 0x63, 0x68])
    .concat([0x43, 0x6f, 0x6e, 0x66, 0x43, 0x61, 0x72, 0x64]);
  const apdu_SELECT_EF = [0x00, 0xa4, 0x00, 0x0c, 0x02, 0x01, 0x01];
  const apdu_READ_BINARY = (offset, len) => [0x00, 0xb0, 0x00, offset, len];
  const apdu_IS_REBOOTED = [0x80, 0x10, 0x84, 0x00, 0x01];
  const apdu_ANNOUNCE_REBOOT = [0x80, 0x11, 0x84, 0x00, 0x01]
    .concat([0x33]) // reqAction
    .concat([0x00, 0x00, 0x00, 123]); // timeout
  const apdu_FINISHED = [0x80, 0x11, 0x82, 0x00, 0x01, FinishCode.ErrUpload];
  const _64kBlob = Array(0x10000).fill(99);

  beforeEach(() => {
    sentReaderInfo = null;
    sentFinishCode = null;
    sentProgress = null;
    bec2Sess = new Bec2OverNfcSession(
      null,
      (finishCode: FinishCode) => {
        if (sentFinishCode) throw new Error("FINISHED sent twice");
        sentFinishCode = finishCode;
      },
      (readInfo: ReaderInfo) => {
        if (sentReaderInfo) throw new Error("SEND READERINFO sent twice");
        sentReaderInfo = readInfo;
      },
      (progress: number, transferredBytes: number) => {
        sentProgress = progress;
        sentBytes = transferredBytes;
      }
    );
    bec2Sess.powerUp();
  });

  describe("ISO7816 File selection", () => {
    it("should return status 0x6D00 on unknown command", () => {
      const apduUnknownCmd = [0x00, 0x01, 0x02];
      expect(bec2Sess.processApdu(apduUnknownCmd)).to.deep.equal([0x6d, 0x00]);
    });

    it("should return status 0x6A82 invalid DF", () => {
      const apduSelectInvDF = [0x00, 0xa4, 0x04, 0x0c, 0x03, 0x01, 0x02, 0x03];
      expect(bec2Sess.processApdu(apduSelectInvDF)).to.deep.equal([0x6a, 0x82]);
    });

    it("should return status 0x9000 on correct DF", () => {
      expect(bec2Sess.processApdu(apdu_SELECT_DF)).to.deep.equal([0x90, 0x00]);
    });

    it("should return status 0x6A82 unknown EF within DF", () => {
      bec2Sess.processApdu(apdu_SELECT_DF);
      const selectUnknownEF = [0x00, 0xa4, 0x00, 0x0c, 0x02, 0x44, 0x55];
      expect(bec2Sess.processApdu(selectUnknownEF)).to.deep.equal([0x6a, 0x82]);
    });

    it("should return status 0x9000 on correct EF within DF", () => {
      bec2Sess.processApdu(apdu_SELECT_DF);
      expect(bec2Sess.processApdu(apdu_SELECT_EF)).to.deep.equal([0x90, 0x00]);
    });
  });

  describe("Send Firmware Data", () => {
    beforeEach(() => {
      bec2Sess.processApdu(apdu_SELECT_DF);
      bec2Sess.processApdu(apdu_SELECT_EF);
    });

    it("should return part of firmware on standard READ BINARY", () => {
      const firmware = [11, 22, 33, 44, 55, 66].concat(_64kBlob);
      bec2Sess.content = firmware;
      const readBinaryResult = bec2Sess.processApdu(apdu_READ_BINARY(2, 3));
      expect(readBinaryResult).to.deep.equal(
        firmware.slice(2, 5).concat([0x90, 0x00])
      );
    });

    it("should return status 6A84 when offset above firwmare length", () => {
      bec2Sess.content = [1];
      const readBinaryResult = bec2Sess.processApdu(apdu_READ_BINARY(0, 2));
      expect(readBinaryResult).to.deep.equal([0x6a, 0x84]);
    });

    it("should return part of firmware on advanced READ BINARY", () => {
      bec2Sess.content = [..._64kBlob, 0x11, 0x22, ..._64kBlob];
      const l = 0x33;
      const apdu_READ_BINARY = [0x00, 0xb1]
        .concat([0x00, 0x00, 0x06, 0x54, 0x84])
        .concat([0x00, 0x01, 0x00, 0x02, 3 + l]);
      const contentResult = bec2Sess.content.slice(0x10002, 0x10002 + l);
      expect(bec2Sess.processApdu(apdu_READ_BINARY)).to.deep.equal(
        [0x53, 0x81, l, ...contentResult].concat([0x90, 0x00])
      );
    });

    it("should return file content 'INFO\0' if no content is set", () => {
      const readBinaryResult = bec2Sess.processApdu(apdu_READ_BINARY(0, 5));
      const resultAsStr = String.fromCharCode(...readBinaryResult.slice(0, 5));
      expect(resultAsStr).to.equal("INFO\0");
    });
  });

  describe("Reboot handling", function () {
    it("should return 0x00 on initial call to IS REBOOTED", () => {
      let reqAction = bec2Sess.processApdu(apdu_IS_REBOOTED);
      expect(reqAction).to.deep.equal([0x00, 0x90, 0x00]);
    });

    it("should return OK on ANNOUNCE REBOOT", () => {
      const errCode = bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT);
      expect(errCode).to.deep.equal([0x90, 0x00]);
    });

    it("should return value of last ANNOUNCE REBOOT on following call to IS REBOOTED", () => {
      bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT);
      bec2Sess.powerUp();
      let reqActionAfterReboot = bec2Sess.processApdu(apdu_IS_REBOOTED);
      expect(reqActionAfterReboot).to.deep.equal([0x33, 0x90, 0x00]);
    });
  });

  it("should call reportReaderInfo on SEND READERINFO", () => {
    const info: ReaderInfo = {
      fwString: "1234 FWNAME    1.23.45 11/22/33 12345678",
      bootStatus: 0x12345678,
      cfgId: "12345-6789-9876-54",
      cfgName: "CFGNAME",
      devSettCfgId: "54321-9876-6789-23",
      devSettName: "DEVSETNAME",
    };
    const infoStr =
      info.fwString +
      "\x12\x34\x56\x78" +
      info.cfgId +
      String.fromCharCode(info.cfgName.length) +
      info.cfgName +
      info.devSettCfgId +
      String.fromCharCode(info.devSettName.length) +
      info.devSettName;
    const Lc = infoStr.length;
    const infoArr = Array.from(infoStr).map((s) => s.charCodeAt(0));
    const apdu_SEND_READER_INFO = [0x80, 0x11, 0x81, 0x00, Lc].concat(infoArr);
    const resultSendReaderInfo = bec2Sess.processApdu(apdu_SEND_READER_INFO);
    expect(resultSendReaderInfo).to.deep.equal([0x90, 0x00]);
    expect(sentReaderInfo).to.deep.equal(info);
  });

  describe("Finished behaviour", () => {
    it("should call reportFinished on FINISHED", () => {
      expect(bec2Sess.processApdu(apdu_FINISHED)).to.deep.equal([0x90, 0x00]);
      expect(sentFinishCode).to.equal(FinishCode.ErrUpload);
    });

    it("should not allow further commands after FINISHED", () => {
      bec2Sess.processApdu(apdu_FINISHED);
      expect(bec2Sess.processApdu(apdu_SELECT_DF)).to.deep.equal([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_SELECT_EF)).to.deep.equal([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_READ_BINARY(0, 1))).to.deep.equal([
        0x69,
        0x69,
      ]);
      const resultAnnounceReboot = bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT);
      expect(resultAnnounceReboot).to.deep.equal([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_FINISHED)).to.deep.equal([0x69, 0x85]);
    });
  });
});
