import { Http, HttpResponse } from "@nativescript/core";
import { ReaderInfo, ReaderStats } from "./bec2OverNfcSession";

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
    result["$" + nm] = val.toString();
  }
  return result;
}

export function reportStats(readerInfo: ReaderInfo, readerStats: ReaderStats) {
  console.log(
    `Report ${JSON.stringify({
      readerInfo: readerInfo,
      readerStats: readerStats,
    })}`
  );
  const busAdrVals =
    readerInfo.busAdr == null ? {} : { $BusAddress: readerInfo.busAdr };
  Http.request({
    url: "https://api.staticforms.xyz/submit",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    content: JSON.stringify({
      subject: "Statistics from Reader " + readerInfo.fwString.slice(-8),
      accessKey: "3c01062e-85d1-40bf-9129-33fa552bc6c6", // bugreport@baltech.de
      $FirmwareString: readerInfo.fwString,
      $PartNo: readerInfo.partNo,
      $HwRevNo: readerInfo.hwRevNo,
      $ConfigID: readerInfo.cfgId + " " + readerInfo.cfgName,
      $DevSettConfigID: readerInfo.devSettCfgId + " " + readerInfo.devSettName,
      ...decodeMap(
        bitMaskToList(readerInfo.bootStatus),
        "BootStatus",
        bootStatusNameMap
      ),
      ...decodeMap(
        bitMaskToList(readerInfo.licenseBitMask),
        "License",
        licenseNameMap
      ),
      ...busAdrVals,
      ...decodeMap(readerStats, "StatisticsCounter", statisticsNameMap),
    }),
  })
    .then((response: HttpResponse) => {
      console.log(`Http POST Result: ${response.statusCode}`);
    })
    .catch((error) => {
      console.log(`Http POST Failure: ${error}`);
    });

  return false;
}
