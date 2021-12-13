<template>
  <page>
    <action-bar title="Baltech Mobile Uploader" />
    <stack-layout verticalAlignment="middle">
      <template v-if="state === AppState.ScanForInfo">
        <label
          class="message"
          text="Please hold your Mobile Phone near a Baltech Reader"
        />
        <button
          v-if="syncRequired"
          text="Transfer Logs to Baltech"
          @tap="reportReaderStats"
        />
      </template>
      <!-------------------------------->
      <template v-else-if="state === AppState.ShowReaderInfo">
        <label class="message" text="State of Detected Reader" />
        <label class="label" text="SerialNo" />
        <label class="data" :text="readerInfo.fwString.slice(32, 40)" />
        <label class="label" text="Firmware" />
        <label class="data" :text="readerInfo.fwString.slice(0, 31)" />
        <template v-if="readerInfo.cfgId">
          <label class="label" text="Configuration" />
          <label
            class="data"
            :text="readerInfo.cfgName"
            v-if="readerInfo.cfgId.slice(0, 5) === '99999'"
          />
          <label
            v-else
            class="data"
            :text="readerInfo.cfgId + ' ' + readerInfo.cfgName"
          />
        </template>
        <template v-if="readerInfo.bootStatus">
          <label class="label" text="BootStatus" />
          <label
            class="data"
            :text="readerInfo.bootStatus.toString(16).padStart(8)"
          />
        </template>
        <button
          v-if="readerStats"
          @tap="reportReaderStats"
          text="Report Reader's Logs to BALTECH"
          class="warning"
        />
      </template>
      <!-------------------------------->
      <template v-else-if="state === AppState.ScanForUpdate">
        <label
          class="message"
          text="Please hold your Mobile Phone near a Baltech reader"
        />
        <label class="message" text="to load the following BEC2 File" />
        <template
          v-if="
            bec2File.header['FirmwareId'] && bec2File.header['FirmwareVersion']
          "
        >
          <label class="label" text="Firmware" />
          <label class="data" :text="fullFirmwareId" />
        </template>
        <template v-if="bec2File.header['Configuration']">
          <label class="label" text="Configuration" />
          <label class="data" :text="bec2File.header['Configuration']" />
        </template>
        <button text="Read Reader Info" @tap="restartInfoScanning" />
      </template>
      <!-------------------------------->
      <template
        v-else-if="
          state === AppState.Updating || state === AppState.ConnectionLost
        "
      >
        <label class="message" text="Transferring BEC2 file..." />
        <label class="label" text="Please do not remove Mobile Phone" />
        <label class="label" text="Progress" />
        <progress
          :value="progress * 10000"
          maxValue="10000"
          margin="0 10 20 10"
        />
        <label class="label" text="Transferred data" />
        <label class="data" :text="(transBytes / 1024).toFixed(1) + 'kB'" />
        <template v-if="state === AppState.ConnectionLost">
          <label class="fail" text="Connection Lost!" />
          <label class="fail" text="Please Realign Handy" />
        </template>
      </template>
      <!-------------------------------->
      <template
        v-else-if="
          state === AppState.UpdatedSuccessfully ||
          state === AppState.UpdateFailure
        "
      >
        <template v-if="state === AppState.UpdatedSuccessfully">
          <label class="message" text="BEC2 file transferred successfully" />
        </template>
        <template v-else-if="state === AppState.UpdateFailure">
          <label class="message" text="Failed to transfer BEC2 file" />
          <label class="label" text="Error Code" />
          <label class="data" :text="this.FinishCode[failureCode]" />
        </template>
        <button text="Scan for next Reader to update" @tap="restartScanning" />
        <button text="Read Reader Info" @tap="restartInfoScanning" />
      </template>
      <!-------------------------------->
      <template v-else-if="state === AppState.ReportingReaderStats">
        <template v-if="reportStatsResult === null">
          <label
            class="message"
            text="Transferring Reader's Logs to BALTECH AG"
          />
          <activityIndicator busy="true" />
        </template>
        <template v-else-if="reportStatsResult === SendResult.Ok">
          <label
            class="message"
            text="Successfully transferred Logs to BALTECH AG"
          />
        </template>
        <template v-else>
          <label
            v-if="reportStatsResult === SendResult.NetworkFailure"
            class="message"
            text="No Internetconnection for sending data"
          />
          <label
            v-if="reportStatsResult === SendResult.ServerFailure"
            class="message"
            text="BALTECH Server is not working or blocked"
          />
          <label class="data" text="Please retry" />
        </template>
        <button text="OK" @tap="restartInfoScanning" />
      </template>
    </stack-layout>
  </page>
</template>

<style scoped>
label {
  border-color: white;
  text-wrap: true;
  font-size: 15;
  border-width: 10;
  text-align: center;
}

.message {
  color: #3a53ff;
  font-size: 20;
}

.label {
  border-bottom-width: 0;
}

.data {
  border-top-width: 0;
  font-weight: bold;
  font-size: 18;
}

.fail {
  border-width: 20;
  font-weight: bold;
  font-size: 18;
  color: red;
}

.warning {
  color: orange;
}
</style>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import { clearTimeout, setTimeout } from "@nativescript/core/timer";
import registerContentHandler from "~/drivers/viewIntentHandler";
import Bec2File from "~/bec2Format";
import {
  reportStats,
  SendResult,
  syncReportedStats,
  whenSyncRequired,
} from "~/reportStats";
import {
  Bec2OverNfcSession,
  FinishCode,
  ReaderInfo,
  ReaderStats,
} from "~/bec2OverNfcSession";
import { activateEmulatedCard } from "~/drivers/hostCardEmulationService";

enum AppState {
  ScanForInfo,
  ShowReaderInfo,
  ScanForUpdate,
  Updating,
  ConnectionLost,
  UpdatedSuccessfully,
  UpdateFailure,
  ReportingReaderStats,
}

@Component
export default class Home extends Vue {
  // for use in template...
  FinishCode = FinishCode;
  AppState = AppState;
  SendResult = SendResult;
  syncRequired = false;

  state: AppState = null;
  readerInfo: ReaderInfo = null;
  readerStats: ReaderStats = null;
  bec2File: Bec2File = null;
  failureCode: FinishCode = null;
  transBytes: number = null;
  progress: number = null;
  timerId: number = null;
  reportStatsResult: SendResult = null;

  get fullFirmwareId() {
    return `${this.bec2File?.header["FirmwareId"]} ${this.bec2File?.header["FirmwareVersion"]}`;
  }

  mounted() {
    this.restartInfoScanning();
    whenSyncRequired.then((si) => {
      this.syncRequired = si;
    });
    registerContentHandler((bec2FileAsText) => {
      this.bec2File = Bec2File.parse(bec2FileAsText);
      this.restartScanning();
    });
  }

  unmounted() {
    registerContentHandler(null);
  }

  restartInfoScanning() {
    this.state = AppState.ScanForInfo;
    activateEmulatedCard(
      new Bec2OverNfcSession(
        null,
        null,
        (ri) => {
          this.state = AppState.ShowReaderInfo;
          this.readerInfo = ri;
          clearTimeout(this.timerId);
          this.timerId = setTimeout(() => {
            this.state = AppState.ScanForInfo;
          }, 1000);
        },
        (rs) => {
          this.readerStats = rs;
          return false;
        }
      )
    );
  }

  restartScanning() {
    this.state = AppState.ScanForUpdate;
    activateEmulatedCard(
      new Bec2OverNfcSession(
        this.bec2File.content,
        (finishCode: FinishCode) => {
          if (finishCode == FinishCode.Ok)
            this.state = AppState.UpdatedSuccessfully;
          else {
            this.state = AppState.UpdateFailure;
            this.failureCode = finishCode;
          }
          activateEmulatedCard(null);
        },
        null,
        null,
        (_progress: number, _transferredBytes: number) => {
          this.state = AppState.Updating;
          this.progress = _progress;
          this.transBytes = _transferredBytes;
        },
        () => {
          this.state = AppState.ConnectionLost;
        }
      )
    );
  }

  async reportReaderStats() {
    console.log("REPORT");
    this.state = AppState.ReportingReaderStats;
    this.reportStatsResult = null;
    clearTimeout(this.timerId);
    activateEmulatedCard(null);

    if (this.readerInfo && this.readerStats)
      reportStats(this.readerInfo, this.readerStats);
    this.reportStatsResult = await syncReportedStats();
    this.syncRequired = this.reportStatsResult !== SendResult.Ok;
  }
}
</script>
