import { EmulatedCard } from "./hostCardEmulationService";

const ENABLE_LOGGING = true;

export interface ReaderInfo {
  fwString: string;
  bootStatus: number;
  cfgId: string;
  cfgName: string;
  devSettCfgId: string;
  devSettName: string;
}

export enum FinishCode {
  Ok = 0x00,
  ErrBusy = 0x01,
  ErrReadFile = 0x02,
  ErrInvalidFormat = 0x03,
  ErrInvalidCustomerKey = 0x04,
  ErrInvalidConfSecCode = 0x05,
  ErrInvalidCfgVersion = 0x06,
  ErrInvalidCMac = 0x07,
  ErrUpload = 0x08,
  ErrUnsupportedFirmware = 0x09,
  ErrAlreadyUpToDate = 0x0a,
  ErrMissingConfSecCode = 0x0b,

  // negative numbers are internal error codes, that are not returned by reader
  ErrConnectionLost = -1,
}

function toHexBlock(array: number[]) {
  const maxSize = 16;
  if (array.length <= maxSize)
    return array.map((c) => c.toString(16).padStart(2, "0")).join(" ");
  else
    return (
      "\n\t\t\t\t" +
      [...array.keys()]
        .slice(0, 1 + array.length / maxSize)
        .map((i) => toHexBlock(array.slice(i * maxSize, (i + 1) * maxSize)))
        .join("\n\t\t\t\t")
    );
}

function toTimeStr(timestamp: Date) {
  const hours = timestamp.getHours().toString().padStart(2, "0");
  const minutes = timestamp.getMinutes().toString().padStart(2, "0");
  const seconds = timestamp.getSeconds().toString().padStart(2, "0");
  const ms = timestamp.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

type ApduHandlerFunc = (params: number[]) => number[];

class ApduDispatcher {
  register(prefix: number[]): MethodDecorator {
    return (
      targetCls: EmulatedCard,
      methodName: string,
      descriptor: PropertyDescriptor
    ) => {
      this.handlers.push([prefix, descriptor.value]);
    };
  }

  dispatch(hceProt, cmd: number[]): number[] {
    for (let [handlerPrefix, handler] of this.handlers) {
      let cmdPrefix = cmd.slice(0, handlerPrefix.length);
      if (cmdPrefix.toString() == handlerPrefix.toString()) {
        const params = cmd.slice(handlerPrefix.length);
        return ApduDispatcher.logApduExec(hceProt, handler, params);
      }
    }
    return null;
  }

  private handlers: Array<[number[], ApduHandlerFunc]> = [];

  private static log = ENABLE_LOGGING ? console.log : (x) => {};

  private static logApduExec(hceProt, func: ApduHandlerFunc, params: number[]) {
    let response = null;
    ApduDispatcher.log(
      `${toTimeStr(new Date())}: APDU ${func.name}(${toHexBlock(params)})`
    );
    response = func.call(hceProt, params);
    ApduDispatcher.log(
      `           => APDU response: (${toHexBlock(response)})`
    );
    return response;
  }
}

enum Bec2OverNfcState {
  Initialized,
  ReaderConnected,
  DfNameSelected,
  EfIdSelected,
  Rebooting,
  ConnectionLost,
  Finished,
}

const CONTENT_FOR_GET_INFO = Array.from("INFO\0").map((c) => c.charCodeAt(0));

const DF_NAME = "\xF1BaltechConfCard";
const EF_ID = [0x01, 0x01];

const STATUS_NO_CURRENT_EF = [0x69, 0x69];
const STATUS_CONDITION_OF_USE_NOT_SATISFIED = [0x69, 0x85];
const STATUS_FILE_OR_APP_NOT_FOUND = [0x6a, 0x82];
const STATUS_NOT_ENOUGH_MEMRORY_IN_FILE = [0x6a, 0x84];
const STATUS_INCORRECT_PARAMS = [0x6a, 0x86];
const STATUS_INSTR_CODE_INVALID = [0x6d, 0x00];
const STATUS_OK = [0x90, 0x00];

export class Bec2OverNfcSession implements EmulatedCard {
  static apduDisp = new ApduDispatcher();
  static TRANSFER_SPEED = 10000.0; // measured in bytes per second
  static PROGRESS_UPDATES_DURING_REBOOT = 0.1;
  static CONNECTION_LOST_TIMEOUT = 1.0;
  static FINAL_CONNECTION_LOST_TIMEOUT = 15.0;

  private state = Bec2OverNfcState.Initialized;
  private reqAction = 0x00;

  // number of bytes expected by reader to be transferred
  // (see SEND_ESTIMATION apdu)
  private estimatedBytes: number;
  // number of bytes transferred after the SEND_ESTIMATION apdu
  private transferredBytes = 0;
  // number of seconds waited by WAIT_CYCLE apdus or after ANNOUNCED_REBOOTs
  private waitedExtraTime = 0;
  // number of seconds expected by reader to be waited in addition to transfer
  // time (see SEND_ESTIMATION apdu)
  private estimatedExtraTime: number;
  // timestamp of last executed apdu
  // (needed to calculated time needed by current apdu)
  private lastApduTimestamp: number;
  // while rebooting the progress callback shall be called regularly. This
  // is achieved by this interval timer
  private rebootUpdateIntervalId: number;
  // timer until timeout for too long connection losses
  private connectionLostTimerId: number;

  constructor(
    public content?: number[],
    private reportFinished?: (finishCode: FinishCode) => void,
    private reportReaderInfo?: (readerInfo: ReaderInfo) => void,
    private reportProgress?: (progress: number, transBytes: number) => void,
    private reportConnectionLost?: () => void
  ) {}

  powerUp() {
    if (this.state === Bec2OverNfcState.Rebooting) {
      console.log("STOP INTERVAL");
      clearInterval(this.rebootUpdateIntervalId);
      this.waitedExtraTime += Date.now() / 1000 - this.lastApduTimestamp;
    }
    this.state = Bec2OverNfcState.ReaderConnected;
  }

  private connectionLost = () => {
    if (this.state === Bec2OverNfcState.ConnectionLost) {
      this.state = Bec2OverNfcState.Finished;
      this.connectionLostTimerId = null;
      if (this.reportFinished)
        this.reportFinished(FinishCode.ErrConnectionLost);
    } else if (this.state !== Bec2OverNfcState.Finished) {
      this.state = Bec2OverNfcState.ConnectionLost;
      this.connectionLostTimerId = setTimeout(
        this.connectionLost,
        (Bec2OverNfcSession.FINAL_CONNECTION_LOST_TIMEOUT -
          Bec2OverNfcSession.CONNECTION_LOST_TIMEOUT) *
          1000
      );
      if (this.reportConnectionLost) this.reportConnectionLost();
    }
  };

  processApdu(input: number[]) {
    if (this.connectionLostTimerId) clearTimeout(this.connectionLostTimerId);
    this.connectionLostTimerId = null;
    if (this.state == Bec2OverNfcState.ConnectionLost)
      this.state = Bec2OverNfcState.ReaderConnected;

    // ANNOUNCE REBOOT without doing actually a reboot
    if (this.state === Bec2OverNfcState.Rebooting) this.powerUp();

    let response = Bec2OverNfcSession.apduDisp.dispatch(this, input);
    if (!response) return STATUS_INSTR_CODE_INVALID;

    if (this.state !== Bec2OverNfcState.Finished) this.callReportProgress();
    this.lastApduTimestamp = Date.now() / 1000;

    if (
      this.state !== Bec2OverNfcState.Rebooting &&
      this.state !== Bec2OverNfcState.Finished
    ) {
      this.connectionLostTimerId = setTimeout(
        this.connectionLost,
        Bec2OverNfcSession.CONNECTION_LOST_TIMEOUT * 1000
      );
    }

    return response;
  }

  @Bec2OverNfcSession.apduDisp.register([0x00, 0xa4, 0x04, 0x0c])
  selectDf(param: number[]) {
    const dfNameAsIntArr = Array.from(DF_NAME).map((c) => c.charCodeAt(0));
    let expParam = [DF_NAME.length].concat(dfNameAsIntArr);
    if (param.toString() != expParam.toString())
      return STATUS_FILE_OR_APP_NOT_FOUND;
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    this.state = Bec2OverNfcState.DfNameSelected;
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x00, 0xa4, 0x00, 0x0c])
  selectEf(param: number[]) {
    let expParam = [EF_ID.length].concat(EF_ID);
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (this.state != Bec2OverNfcState.DfNameSelected)
      return STATUS_FILE_OR_APP_NOT_FOUND;
    if (param.toString() != expParam.toString())
      return STATUS_FILE_OR_APP_NOT_FOUND;
    this.state = Bec2OverNfcState.EfIdSelected;
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x00, 0xb0])
  readBinaryStandard(param: number[]) {
    if (param.length != 3) return STATUS_INCORRECT_PARAMS;
    const [offs_hi, offs_low, len] = param;
    const resp = this.readBinaryAdvanced([0, 0, offs_hi, offs_low, len + 3]);
    return resp.length == 2 ? resp : resp.slice(3);
  }

  @Bec2OverNfcSession.apduDisp.register(
    [0x00, 0xb1].concat([0x00, 0x00, 0x06, 0x54, 0x84])
  )
  readBinaryAdvanced(param: number[]) {
    if (param.length != 5) return STATUS_INCORRECT_PARAMS;
    if (this.state != Bec2OverNfcState.EfIdSelected)
      return STATUS_NO_CURRENT_EF;
    const [offs1, offs2, offs3, offs4, len1] = param;
    const offset = ((offs1 * 0x100 + offs2) * 0x100 + offs3) * 0x100 + offs4;
    const length = len1 - 3;
    const content = this.content ?? CONTENT_FOR_GET_INFO;
    if (offset + length > content.length)
      return STATUS_NOT_ENOUGH_MEMRORY_IN_FILE;
    const sliceOfContent = content.slice(offset, offset + length);
    this.transferredBytes += length;
    return [0x53, 0x81, length, ...sliceOfContent, ...STATUS_OK];
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x10, 0x84, 0x00, 0x01])
  isRebooted(param: number[]) {
    if (param.length > 0) return STATUS_INCORRECT_PARAMS;
    return [this.reqAction].concat(STATUS_OK);
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x85, 0x00, 0x05])
  announceReboot(param: number[]) {
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (param.length != 5) return STATUS_INCORRECT_PARAMS;
    this.reqAction = param[0];
    console.log("START INTERVAL");
    this.rebootUpdateIntervalId = setInterval(() => {
      console.log("PROGRESS");
      this.waitedExtraTime += Date.now() / 1000 - this.lastApduTimestamp;
      this.lastApduTimestamp = Date.now() / 1000;
      this.callReportProgress();
    }, Bec2OverNfcSession.PROGRESS_UPDATES_DURING_REBOOT * 1000);
    this.state = Bec2OverNfcState.Rebooting;
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x81, 0x00])
  sendReaderInfo(param: number[]) {
    function readNextStr(len) {
      curPos = curPos + len;
      return String.fromCharCode(...param.slice(curPos - len, curPos));
    }
    const readNextInt = (bits: number) =>
      bits == 8
        ? readNextStr(1).charCodeAt(0)
        : readNextInt(bits - 8) * 0x100 + readNextInt(8);

    let curPos = 0;
    let Lc = readNextInt(8);
    let readerInfo = {
      fwString: readNextStr(40),
      bootStatus: readNextInt(32),
      cfgId: readNextStr(18),
      cfgName: readNextStr(readNextInt(8)),
      devSettCfgId: readNextStr(18),
      devSettName: readNextStr(readNextInt(8)),
    };
    if (curPos != param.length) return STATUS_INCORRECT_PARAMS;
    if (curPos != 1 + Lc) return STATUS_INCORRECT_PARAMS;

    if (this.reportReaderInfo) this.reportReaderInfo(readerInfo);
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x82, 0x00, 0x01])
  finished(params: number[]) {
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (params.length != 1) return STATUS_INCORRECT_PARAMS;
    if (this.reportFinished) this.reportFinished(params[0]);
    this.state = Bec2OverNfcState.Finished;
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x83, 0x00, 0x08])
  sendEstimation(params: number[]) {
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (params.length != 8) return STATUS_INCORRECT_PARAMS;
    const [eb24, eb16, eb8, eb0, et24, et16, et8, et0] = params;
    this.estimatedBytes = (eb24 << 24) + (eb16 << 16) + (eb8 << 8) + eb0;
    this.estimatedExtraTime =
      ((et24 << 24) + (et16 << 16) + (et8 << 8) + et0) / 1000;
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x86, 0x00])
  waitingCycle(params) {
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (params.length != 0) return STATUS_INCORRECT_PARAMS;
    this.waitedExtraTime += Date.now() / 1000 - this.lastApduTimestamp;
    return STATUS_OK;
  }

  private callReportProgress() {
    if (this.reportProgress)
      if (this.estimatedBytes === undefined)
        this.reportProgress(undefined, this.transferredBytes);
      else {
        const speed = Bec2OverNfcSession.TRANSFER_SPEED;
        const totalTime = this.estimatedBytes / speed + this.estimatedExtraTime;
        const passedTime = this.transferredBytes / speed + this.waitedExtraTime;
        const progress = Math.min(passedTime / totalTime, 1.0);
        this.reportProgress(progress, this.transferredBytes);
      }
  }
}
