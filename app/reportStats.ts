import { sendBugReport, SendResult } from "~/drivers/sendBugReport";
import { readFile, writeFile } from "~/drivers/fileSystemAccess";
import { ReaderInfo, ReaderStats } from "./bec2OverNfcSession";

export { SendResult };

const READERSTATS_CACHE_FILENAME = "readerStatCache.json";

let readerStatsCache: { [key: string]: string }[] = [];
export const whenSyncRequired = readFile(READERSTATS_CACHE_FILENAME).then(
  (data) => {
    if (data) {
      readerStatsCache = JSON.parse(data);
      return readerStatsCache.length > 0;
    }
  }
);

const licenseNameMap = {
  0: "HID License",
  1: "HID License (only with SE SAM)",
};

const statisticsNameMap = {
  2: "WatchdogResetCount",
  3: "StackoverflowCount",
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
  defaultName: string,
  map: { [nm: number]: string }
): { [nm: string]: string } {
  let result = {};
  for (let [key, val] of lst) {
    let nm;
    if (key in map) nm = map[key];
    else nm = defaultName + " " + key.toString();
    result[nm] = val.toString();
  }
  return result;
}

export function reportStats(
  readerInfo: ReaderInfo,
  readerStats: ReaderStats
): void {
  const busAdrVals =
    readerInfo.busAdr == null
      ? {}
      : { BusAddress: readerInfo.busAdr.toString() };
  const licenseVals = decodeMap(
    bitMaskToList(readerInfo.licenseBitMask),
    "License ",
    licenseNameMap
  );
  const bootStatusVals = decodeMap(
    bitMaskToList(readerInfo.bootStatus),
    "BootStatus ",
    bootStatusNameMap
  );
  const statCountMap = decodeMap(
    readerStats,
    "StatisticsCounter ",
    statisticsNameMap
  );
  readerStatsCache.push({
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
  });
  writeFile(READERSTATS_CACHE_FILENAME, JSON.stringify(readerStatsCache));
}

export async function syncReportedStats(): Promise<SendResult> {
  while (readerStatsCache.length > 0) {
    const readerStats = readerStatsCache[0];
    const sendResult = await sendBugReport(
      "Statistics from Reader " + readerStats.FirmwareString.slice(-8),
      readerStats
    );
    if (sendResult != SendResult.Ok) return sendResult;
    readerStatsCache.shift();
    writeFile(READERSTATS_CACHE_FILENAME, JSON.stringify(readerStatsCache));
  }
  return SendResult.Ok;
}
