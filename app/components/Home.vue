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
          text="Retry Transferring Logs to BALTECH"
          @tap="reportInfos"
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
          text="Report Reader Infos to BALTECH"
          @tap="readerInfo.bootStatus ? requestReportInfos() : reportInfos()"
          :class="readerStats ? ['warning'] : []"
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
          <label class="data" :text="FinishCode[failureCode]" />
        </template>
        <button text="Scan for next Reader to update" @tap="restartScanning" />
        <button text="Read Reader Info" @tap="restartInfoScanning" />
      </template>
      <!-------------------------------->
      <template v-else-if="state === AppState.ReportingReaderInfos">
        <template v-if="reportReaderInfoResult === null">
          <label
            class="message"
            text="Transferring Reader's Logs to BALTECH AG"
          />
          <activityIndicator busy="true" />
        </template>
        <template v-else-if="reportReaderInfoResult === SendResult.Ok">
          <label
            class="message"
            text="Successfully transferred Logs to BALTECH AG"
          />
        </template>
        <template v-else>
          <label
            v-if="reportReaderInfoResult === SendResult.NetworkFailure"
            class="message"
            text="No Internetconnection for sending data"
          />
          <label
            v-if="reportReaderInfoResult === SendResult.ServerFailure"
            class="message"
            text="BALTECH Server is not working or blocked"
          />
          <label class="data" text="Please retry transferring logs later" />
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
import { onMounted, onUnmounted, ref, computed } from "@vue/composition-api";
import { clearTimeout, setTimeout } from "@nativescript/core/timer";
import { registerContentHandler } from "~/drivers/viewIntentHandler";
import Bec2File from "~/bec2Format";
import {
  reportReaderInfo,
  SendResult,
  syncReportedInfos,
  whenSyncRequired,
} from "~/reportReaderInfo";
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
  ReportingReaderInfos,
}

export default {
  setup() {
    const syncRequired = ref(false);
    const state = ref<AppState>(null);
    const readerInfo = ref<ReaderInfo>(null);
    const readerStats = ref<ReaderStats>(null);
    const bec2File = ref<Bec2File>(null);
    const failureCode = ref<FinishCode>(null);
    const transBytes = ref<number>(null);
    const progress = ref<number>(null);
    const timerId = ref<number>(null);
    const reportReaderInfoResult = ref<SendResult>(null);
    const reqReportInfos = ref(false);

    const fullFirmwareId = computed(
      () =>
        `${bec2File?.value.header["FirmwareId"]} ${bec2File?.value.header["FirmwareVersion"]}`
    );

    onMounted(() => {
      restartInfoScanning();
      whenSyncRequired.then((si) => {
        syncRequired.value = si;
      });
      registerContentHandler((bec2FileAsText) => {
        bec2File.value = Bec2File.parse(bec2FileAsText);
        restartScanning();
      });
    });

    onUnmounted(() => {
      registerContentHandler(null);
    });

    function restartInfoScanning() {
      state.value = AppState.ScanForInfo;
      readerStats.value = null;
      reqReportInfos.value = false;
      activateEmulatedCard(
        new Bec2OverNfcSession(
          null,
          null,
          (ri) => {
            state.value = AppState.ShowReaderInfo;
            readerInfo.value = ri;
            clearTimeout(timerId.value);
            timerId.value = setTimeout(() => {
              state.value = AppState.ScanForInfo;
            }, 1000);
          },
          (rs) => {
            if (reqReportInfos.value) {
              reportInfos();
              return true;
            } else {
              readerStats.value = rs;
              return false;
            }
          }
        )
      );
    }

    function restartScanning() {
      state.value = AppState.ScanForUpdate;
      activateEmulatedCard(
        new Bec2OverNfcSession(
          bec2File.value.content,
          (finishCode: FinishCode) => {
            if (finishCode == FinishCode.Ok)
              state.value = AppState.UpdatedSuccessfully;
            else {
              state.value = AppState.UpdateFailure;
              failureCode.value = finishCode;
            }
            activateEmulatedCard(null);
          },
          null,
          null,
          (_progress: number, _transferredBytes: number) => {
            state.value = AppState.Updating;
            progress.value = _progress;
            transBytes.value = _transferredBytes;
          },
          () => {
            state.value = AppState.ConnectionLost;
          }
        )
      );
    }

    function requestReportInfos() {
      reqReportInfos.value = true;
    }

    async function reportInfos() {
      state.value = AppState.ReportingReaderInfos;
      reportReaderInfoResult.value = null;
      clearTimeout(timerId.value);
      activateEmulatedCard(null);

      if (readerInfo.value)
        reportReaderInfo(readerInfo.value, readerStats.value);
      reportReaderInfoResult.value = await syncReportedInfos();
      syncRequired.value = reportReaderInfoResult.value !== SendResult.Ok;
    }

    return {
      AppState,
      FinishCode,
      SendResult,
      bec2File,
      failureCode,
      fullFirmwareId,
      progress,
      readerInfo,
      readerStats,
      reportInfos,
      reportReaderInfoResult,
      reqReportInfos,
      requestReportInfos,
      restartInfoScanning,
      restartScanning,
      state,
      syncRequired,
      timerId,
      transBytes,
    };
  },
};
</script>
