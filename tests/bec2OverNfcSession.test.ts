import { expect } from "chai";
import { describe, it } from "mocha";
import { Clock, install } from "@sinonjs/fake-timers";
import {
  Bec2OverNfcSession,
  ReaderInfo,
  ReaderStats,
  FinishCode,
} from "~/bec2OverNfcSession";

describe("Bec2OverNfcSession", () => {
  let sentReaderInfo: ReaderInfo;
  let resetReaderStats: boolean;
  let sentReaderStats: ReaderStats;
  let sentFinishCode: FinishCode;
  let connLostTimestamps: number[];
  let sentProgress: number;
  let sentBytes: number;
  let bec2Sess: Bec2OverNfcSession;

  let clock: Clock;
  const _64kBlob = Array(0x10000).fill(99);
  const estimatedBytes = 250;
  const estimatedTransferTime =
    estimatedBytes / Bec2OverNfcSession.TRANSFER_SPEED;

  const apdu_SELECT_DF = [0x00, 0xa4, 0x04, 0x0c, 0x10]
    .concat([0xf1, 0x42, 0x61, 0x6c, 0x74, 0x65, 0x63, 0x68])
    .concat([0x43, 0x6f, 0x6e, 0x66, 0x43, 0x61, 0x72, 0x64]);
  const apdu_SELECT_EF = [0x00, 0xa4, 0x00, 0x0c, 0x02, 0x01, 0x01];
  const apdu_READ_BINARY = (offset, len) => [0x00, 0xb0, 0x00, offset, len];
  const apdu_IS_REBOOTED = [0x80, 0x10, 0x84, 0x00, 0x01];
  const apdu_ANNOUNCE_REBOOT = (reqAction = 1, timeout = 1000) =>
    [0x80, 0x11, 0x85, 0x00, 0x05]
      .concat([reqAction])
      .concat([0x00, 0x00, 0x00, timeout]);
  const apdu_FINISHED = (finCode) => [0x80, 0x11, 0x82, 0x00, 0x01, finCode];
  const apdu_SEND_ESTIMATION = (estimatedBytes, estimatedTime = 0) =>
    [0x80, 0x11, 0x83, 0x00, 0x08]
      .concat([0x00, 0x00, 0x00, estimatedBytes])
      .concat([0x00, 0x00, 0x00, estimatedTime]);
  const apdu_WAITING_CYCLE = [0x80, 0x11, 0x86, 0x00];

  beforeEach(() => {
    clock = install();
    sentReaderInfo = null;
    resetReaderStats = false;
    sentReaderStats = null;
    sentFinishCode = null;
    sentProgress = null;
    connLostTimestamps = [];
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
      (readStats: ReaderStats) => {
        if (sentReaderStats)
          throw new Error("SEND READER STATISTICS sent twice");
        sentReaderStats = readStats;
        return resetReaderStats;
      },
      (progress: number, transferredBytes: number) => {
        sentProgress = progress;
        sentBytes = transferredBytes;
      },
      () => connLostTimestamps.push(Date.now())
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
      const errCode = bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT());
      expect(errCode).to.deep.equal([0x90, 0x00]);
    });

    it("should return value of last ANNOUNCE REBOOT on following call to IS REBOOTED", () => {
      bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT(0x33));
      bec2Sess.powerUp();
      let reqActionAfterReboot = bec2Sess.processApdu(apdu_IS_REBOOTED);
      expect(reqActionAfterReboot).to.deep.equal([0x33, 0x90, 0x00]);
    });
  });

  function encodeReaderInfo(
    info: ReaderInfo,
    bootStatusStr = "    ",
    licsStr = "    "
  ): string {
    return (
      info.fwString.padEnd(40, " ") +
      bootStatusStr +
      info.cfgId.padEnd(18, " ") +
      String.fromCharCode(info.cfgName.length) +
      info.cfgName +
      info.devSettCfgId.padEnd(18, " ") +
      String.fromCharCode(info.devSettName.length) +
      info.devSettName +
      info.partNo.padEnd(12, " ") +
      info.hwRevNo.padEnd(12, " ") +
      licsStr +
      String.fromCharCode(info.busAdr != null ? info.busAdr : 255)
    );
  }

  it("should call reportReaderInfo on SEND READERINFO", () => {
    const info: ReaderInfo = {
      fwString: "1234 FWNAME    1.23.45 11/22/33 12345678",
      bootStatus: 0x12345678,
      cfgId: "12345-6789-9876-54",
      cfgName: "CFGNAME",
      devSettCfgId: "54321-9876-6789-23",
      devSettName: "DEVSETNAME",
      partNo: "12345-123-45",
      hwRevNo: "12345-A03C-1",
      licenseBitMask: 0x11223344,
      busAdr: 73,
    };
    const infoStr = encodeReaderInfo(
      info,
      "\x12\x34\x56\x78",
      "\x11\x22\x33\x44"
    );
    const Lc = infoStr.length;
    const infoArr = Array.from(infoStr).map((s) => s.charCodeAt(0));
    const apdu_SEND_READER_INFO = [0x80, 0x11, 0x81, 0x00, Lc].concat(infoArr);
    const resultSendReaderInfo = bec2Sess.processApdu(apdu_SEND_READER_INFO);
    expect(resultSendReaderInfo).to.deep.equal([0x90, 0x00]);
    expect(sentReaderInfo).to.deep.equal({ ...info, rawData: infoArr });
  });

  it("should return BusAdr null if BusAdr returns 255", () => {
    const info: ReaderInfo = {
      fwString: "",
      bootStatus: 0,
      cfgId: "",
      cfgName: "",
      devSettCfgId: "",
      devSettName: "",
      partNo: "",
      hwRevNo: "",
      licenseBitMask: 0,
      busAdr: null,
    };
    const infoStr = encodeReaderInfo(info);
    const Lc = infoStr.length;
    const infoArr = Array.from(infoStr).map((s) => s.charCodeAt(0));
    const apdu_SEND_READER_INFO = [0x80, 0x11, 0x81, 0x00, Lc].concat(infoArr);
    const resultSendReaderInfo = bec2Sess.processApdu(apdu_SEND_READER_INFO);
    expect(resultSendReaderInfo).to.deep.equal([0x90, 0x00]);
    expect(sentReaderInfo.busAdr).to.null;
  });

  describe("send stats", function () {
    it("should call reportReaderStats with empty List on empty SEND STATISTCS", () => {
      const apdu = [0x80, 0x11, 0x87, 0x00, 0x01, 0x00];
      const apdu_result = bec2Sess.processApdu(apdu);
      expect(apdu_result).to.deep.equal([0x00, 0x90, 0x00]);
      expect(sentReaderStats).to.deep.equal([]);
    });

    it("should pass reader statistics on SEND STATISTICS", () => {
      const stats: ReaderStats = [
        [34, 56],
        [1, 255],
        [90, 3],
      ];
      const flatStats = [].concat.apply([], stats);
      let apdu_head = [0x80, 0x11, 0x87, 0x00, 1 + flatStats.length];
      const apdu = [...apdu_head, stats.length, ...flatStats];
      const apdu_result = bec2Sess.processApdu(apdu);
      expect(apdu_result).to.deep.equal([0x00, 0x90, 0x00]);
      expect(sentReaderStats).to.deep.equal(stats);
    });

    it("should return 1 to SEND STATISTICS", () => {
      const apdu = [0x80, 0x11, 0x87, 0x00, 0x01, 0x00];
      resetReaderStats = true;
      const apdu_result = bec2Sess.processApdu(apdu);
      expect(apdu_result).to.deep.equal([0x01, 0x90, 0x00]);
    });

    it("should return STATUS_INCORRECT_PARAMS on too short param size", () => {
      const apdu = [0x80, 0x11, 0x87, 0x00, 0x00, 0x00];
      const apdu_result = bec2Sess.processApdu(apdu);
      expect(apdu_result).to.deep.equal([0x6a, 0x86]);
    });

    it("should return STATUS_INCORRECT_PARAMS on too short array count", () => {
      const apdu = [0x80, 0x11, 0x87, 0x00, 0x03, 0x00, 0x12, 0x34];
      const apdu_result = bec2Sess.processApdu(apdu);
      expect(apdu_result).to.deep.equal([0x6a, 0x86]);
    });
  });
  describe("Finished behaviour", () => {
    it("should call reportFinished on FINISHED", () => {
      const result = bec2Sess.processApdu(apdu_FINISHED(FinishCode.ErrUpload));
      expect(result).to.deep.equal([0x90, 0x00]);
      expect(sentFinishCode).to.equal(FinishCode.ErrUpload);
    });

    it("should not allow further commands after FINISHED", () => {
      const apdu_SEND_ESTIM = apdu_SEND_ESTIMATION(0, 1);
      bec2Sess.processApdu(apdu_FINISHED(FinishCode.ErrUpload));
      expect(bec2Sess.processApdu(apdu_SELECT_DF)).to.eql([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_SELECT_EF)).to.eql([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_READ_BINARY(0, 1))).to.eql([0x69, 0x69]);
      expect(bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT())).to.eql([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_SEND_ESTIM)).to.eql([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_WAITING_CYCLE)).to.eql([0x69, 0x85]);
      expect(bec2Sess.processApdu(apdu_FINISHED(FinishCode.Ok))).to.eql([
        0x69, 0x85,
      ]);
    });

    it("should not call connection lost after apdu FINISHED", () => {
      bec2Sess.processApdu(apdu_FINISHED(FinishCode.Ok));
      clock.tick(15000);
      expect(connLostTimestamps).to.eql([]);
    });

    it("should never again call reportProgress after reportFinish", () => {
      sentBytes = undefined;
      bec2Sess.processApdu(apdu_FINISHED(FinishCode.Ok));
      clock.tick(100000);
      expect(sentBytes).to.be.undefined;
    });
  });

  describe("Resume", () => {
    it("should enter connection lost state after 1sec of no activity", () => {
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      clock.tick(14999);
      expect(connLostTimestamps).to.eql([1000]);
    });

    it("should resume within 15sec by sending a progress callback even without actual progress", () => {
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      sentBytes = -1;
      clock.tick(14999);
      expect(sentBytes).to.eql(-1);
      bec2Sess.processApdu(apdu_SELECT_DF);
      expect(sentBytes).to.eql(undefined);
    });

    it("should finish after 15sec of no activity", () => {
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      clock.tick(15000);
      expect(sentFinishCode).to.equal(FinishCode.ErrConnectionLost);
    });

    it("should not finish when connection resumed", () => {
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      clock.tick(14999);
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      clock.tick(14999);
      expect(sentFinishCode).to.null;
    });
  });

  describe("Estimation", () => {
    beforeEach(() => {
      bec2Sess.processApdu(apdu_SELECT_DF);
      bec2Sess.processApdu(apdu_SELECT_EF);
    });

    it("should return OK on APDU command  SEND ESTIMATION", () => {
      expect(bec2Sess.processApdu(apdu_SEND_ESTIMATION(0))).eql([0x90, 0x00]);
    });

    it("should return OK on  APDU command WAITING CYCLE", () => {
      expect(bec2Sess.processApdu(apdu_WAITING_CYCLE)).eql([0x90, 0x00]);
    });

    it("should report undefined progress and sent bytes before SEND ESTIMATION", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_READ_BINARY(0, 100));
      clock.tick(100);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.be.undefined;
      expect(sentBytes).to.be.undefined;
    });

    it("should report progress sent bytes after data transfer after SEND ESTIMATION", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(estimatedBytes));
      bec2Sess.processApdu(apdu_READ_BINARY(3, estimatedBytes / 10));
      expect(sentProgress).to.approximately(1 / 10, 0.000001);
      expect(sentBytes).to.equal(estimatedBytes / 10);
    });

    it("should sum up percentage of progress and bytes on multiple READ BINARY", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(estimatedBytes));
      bec2Sess.processApdu(apdu_READ_BINARY(3, estimatedBytes / 10));
      bec2Sess.processApdu(apdu_READ_BINARY(3, (estimatedBytes / 10) * 2));
      expect(sentProgress).to.approximately(3 / 10, 0.000001);
      expect(sentBytes).to.equal((estimatedBytes / 10) * 3);
    });

    it("should increment progress since last APDU command on WAITING CYCLE", () => {
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(0, 200));
      clock.tick(150);
      expect(sentProgress).to.equal(0);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.approximately(150 / 200, 0.000001);
    });

    it("should increment progress while waiting after ANNOUCE REBOOT", () => {
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(0, 250));
      bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT(1, 1000));
      clock.tick(100);
      expect(sentProgress).to.approximately(100 / 250, 0.000001);
      clock.tick(100);
      expect(sentProgress).to.approximately(200 / 250, 0.000001);
    });

    it("should sum up progress of ANNOUCE REBOOT and WAIT CYCLE", () => {
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(0, 250));
      bec2Sess.processApdu(apdu_ANNOUNCE_REBOOT(1, 1000));
      clock.tick(70);
      bec2Sess.powerUp();
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      clock.tick(150);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.approximately((70 + 150) / 250, 0.000001);
    });

    it("should sum up progress on multiple WAITING CYCLE", () => {
      bec2Sess.processApdu(apdu_IS_REBOOTED);
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(0, 250));
      clock.tick(80);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      clock.tick(140);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.approximately((80 + 140) / 250, 0.000001);
    });

    it("should sum up progress of WAITING CYCLE and READ BINARY", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(100, 10));
      bec2Sess.processApdu(apdu_READ_BINARY(0, 50));
      clock.tick(5);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.approximately(0.5, 0.000001);
    });

    it("should update estimation when receiving a second SEND ESTIMATION", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(100, 10));
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(200, 20));
      bec2Sess.processApdu(apdu_READ_BINARY(0, 100));
      clock.tick(10);
      bec2Sess.processApdu(apdu_WAITING_CYCLE);
      expect(sentProgress).to.approximately(0.5, 0.000001);
    });

    it("should not exceed progress of 100%", () => {
      bec2Sess.content = _64kBlob;
      bec2Sess.processApdu(apdu_SEND_ESTIMATION(100, 0));
      bec2Sess.processApdu(apdu_READ_BINARY(0, 150));
      expect(sentProgress).to.approximately(1.0, 0.000001);
    });
  });
});
