import { sendBugReport, SendResult } from "~/drivers/sendBugReport";
import { readFile, writeFile } from "~/drivers/fileSystemAccess";
import { ReaderInfo, ReaderStats } from "./bec2OverNfcSession";
import { toHexBlock } from "~/formatters";

export { SendResult };

const READERINFO_CACHE_FILENAME = "readerInfoCache.json";

let readerInfoStrCache: { [key: string]: string }[] = [];
export const whenSyncRequired = readFile(READERINFO_CACHE_FILENAME).then(
  (data) => {
    if (data) {
      readerInfoStrCache = JSON.parse(data);
      return readerInfoStrCache.length > 0;
    }
  }
);

const licenseNameMap = {
  0: "HID License",
  1: "HID License (only with SE SAM)",
};

const statisticsNameMap = {
  2: "WatchdogResetCount",
  3: "StackOverflowCount",
  5: "BrownoutResetCount",
  6: "KeypadResetCount",
  8: "AccessRestrictedTaskOverflowResetCount",
};

const bootStatusNameMap = {
  31: "NewerReaderChipFirmware",
  30: "UnexpectedReboots",
  29: "FactorySettings",
  28: "ConfigurationInconsistent",
  23: "Bluetooth",
  22: "WiFi",
  21: "Tamper",
  20: "BatteryManagement",
  19: "Keyboard",
  18: "FirmwareVersionBlocked",
  17: "Display",
  16: "ConfCardPresented",
  15: "Ethernet",
  14: "ExtendedLED",
  12: "Rf125kHz",
  10: "Rf13MHz",
  9: "Rf13MHzLegic",
  7: "HWoptions",
  5: "RTC",
  4: "Dataflash",
  2: "Configuration",
  1: "CorruptFirmware",
  0: "IncompleteFirmware",
};

function bitMaskToList(bitMask: number): [number, number][] {
  let result = [];
  for (let ndx = 1; ndx < 32; ndx++)
    if ((1 << ndx) & bitMask) result.push([ndx, 1]);
  return result;
}

function decodeMap(
  lst: [number, number][],
  prefix: string,
  map: { [nm: number]: string }
): { [nm: string]: string } {
  let result = {};
  for (let [key, val] of lst) {
    let nm;
    if (key in map) nm = " (" + map[key] + ")";
    else nm = "";
    result[prefix + ":" + key.toString() + nm] = val.toString();
  }
  return result;
}

export function reportReaderInfo(
  readerInfo: ReaderInfo,
  readerStats?: ReaderStats
): void {
  const busAdrVals =
    readerInfo.busAdr == null
      ? {}
      : { BusAddress: readerInfo.busAdr.toString() };
  const licenseVals = decodeMap(
    bitMaskToList(readerInfo.licenseBitMask),
    "LICENSE",
    licenseNameMap
  );
  const bootStatusVals = decodeMap(
    bitMaskToList(readerInfo.bootStatus),
    "BOOTSTATUS",
    bootStatusNameMap
  );
  const statCountMap = decodeMap(
    readerStats || [],
    "STATISTICS",
    statisticsNameMap
  );
  readerInfoStrCache.push({
    Timestamp: new Date(Date.now()).toUTCString(),
    FirmwareString: readerInfo.fwString,
    PartNo: readerInfo.partNo,
    HwRevNo: readerInfo.hwRevNo,
    ConfigID: readerInfo.cfgId + " " + readerInfo.cfgName,
    DevSettConfigID: readerInfo.devSettCfgId + " " + readerInfo.devSettName,
    ...busAdrVals,
    ...licenseVals,
    ...bootStatusVals,
    ...statCountMap,
    "RAWDATA:Send ReaderInfo": toHexBlock(readerInfo.rawData),
    "RAWDATA:Send Statistics": JSON.stringify(readerStats),
  });
  writeFile(READERINFO_CACHE_FILENAME, JSON.stringify(readerInfoStrCache));
}

export async function syncReportedInfos(): Promise<SendResult> {
  while (readerInfoStrCache.length > 0) {
    const readerInfoStr = readerInfoStrCache[0];
    const keysStr = Object.keys(readerInfoStr).join();
    let postfix = "";
    if (keysStr.includes("STATISTICS:")) postfix = " [STATISTICS]";
    else if (keysStr.includes("BOOTSTATUS:")) postfix = " [BOOTSTATUS]";
    const sendResult = await sendBugReport(
      "NFC Readerinfo #" + readerInfoStr.FirmwareString.slice(-8) + postfix,
      readerInfoStr
    );
    if (sendResult != SendResult.Ok) return sendResult;
    readerInfoStrCache.shift();
    writeFile(READERINFO_CACHE_FILENAME, JSON.stringify(readerInfoStrCache));
  }
  return SendResult.Ok;
}
