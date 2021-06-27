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
}

function toHexStr(array: number[]) {
  return array.map((c) => c.toString(16).padStart(2, "0")).join(" ");
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
    try {
      ApduDispatcher.log(`APDU ${func.name}(${toHexStr(params)})`);
      response = func.call(hceProt, params);
    } catch (e) {
      ApduDispatcher.log(`  => APDU caused exception "${e}"`);
      throw e;
    }
    ApduDispatcher.log(`  => APDU response: (${toHexStr(response)})`);
    return response;
  }
}

enum Bec2OverNfcState {
  Initialized,
  ReaderConnected,
  DfNameSelected,
  EfIdSelected,
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

  private state = Bec2OverNfcState.Initialized;
  private reqAction = 0x00;

  constructor(
    public content?: number[],
    private reportFinished?: (finishCode: FinishCode) => void,
    private reportReaderInfo?: (readerInfo: ReaderInfo) => void,
    private reportProgress?: (
      progress: number,
      transferredBytes: number
    ) => void
  ) {}

  powerUp() {
    this.state = Bec2OverNfcState.ReaderConnected;
  }

  processApdu(input: number[]) {
    let response = Bec2OverNfcSession.apduDisp.dispatch(this, input);
    if (!response) return STATUS_INSTR_CODE_INVALID;
    else return response;
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
    return [0x53, 0x81, length, ...sliceOfContent, ...STATUS_OK];
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x10, 0x84, 0x00, 0x01])
  isRebooted(param: number[]) {
    if (param.length > 0) return STATUS_INCORRECT_PARAMS;
    return [this.reqAction].concat(STATUS_OK);
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x84, 0x00, 0x01])
  announceReboot(param: number[]) {
    if (this.state == Bec2OverNfcState.Finished)
      return STATUS_CONDITION_OF_USE_NOT_SATISFIED;
    if (param.length != 5) return STATUS_INCORRECT_PARAMS;
    this.reqAction = param[0];
    return STATUS_OK;
  }

  @Bec2OverNfcSession.apduDisp.register([0x80, 0x11, 0x81, 0x00])
  sendReaderInfo(param: number[]) {
    function readNextStr(len) {
      curPos = curPos + len;
      console.log("  read", len, curPos);
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
}
