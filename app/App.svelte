<script lang="typescript">
  import { setTimeout, clearTimeout } from "@nativescript/core/timer";
  import registerContentHandler from "./viewIntentHandler";
  import Bec2File from "./bec2Format";
  import {
    Bec2OverNfcSession,
    FinishCode,
    ReaderInfo,
  } from "./bec2OverNfcSession";
  import { activateEmulatedCard } from "./hostCardEmulationService";

  enum AppState {
    ScanForInfo,
    ShowReaderInfo,
    ScanForUpdate,
    Updating,
    ConnectionLost,
    UpdatedSuccessfully,
    UpdateFailure,
  }
  let state: AppState;
  let readerInfo: ReaderInfo;
  let bec2File: Bec2File;
  let failureCode: FinishCode;
  let transBytes: number;
  let progress: number;
  let timerId: number;

  function restartInfoScanning() {
    state = AppState.ScanForInfo;
    activateEmulatedCard(
      new Bec2OverNfcSession(null, null, (ri) => {
        state = AppState.ShowReaderInfo;
        readerInfo = ri;
        clearTimeout(timerId);
        timerId = setTimeout(() => {
          state = AppState.ScanForInfo;
        }, 1000);
      })
    );
  }

  function restartScanning() {
    state = AppState.ScanForUpdate;
    activateEmulatedCard(
      new Bec2OverNfcSession(
        bec2File.content,
        (finishCode: FinishCode) => {
          if (finishCode == FinishCode.Ok) state = AppState.UpdatedSuccessfully;
          else {
            state = AppState.UpdateFailure;
            failureCode = finishCode;
          }
          stopScanning();
        },
        null,
        (_progress: number, _transferredBytes: number) => {
          state = AppState.Updating;
          progress = _progress;
          transBytes = _transferredBytes;
        },
        () => {
          state = AppState.ConnectionLost;
        }
      )
    );
  }

  function stopScanning() {
    activateEmulatedCard(null);
  }

  registerContentHandler((bec2FileAsText) => {
    bec2File = Bec2File.parse(bec2FileAsText);
    restartScanning();
  });

  restartInfoScanning();

  $: fullFirmwareId = `${bec2File?.header["FirmwareId"]} ${bec2File?.header["FirmwareVersion"]}`;
</script>

<page>
  <action-bar title="Baltech Mobile Uploader" />
  <stack-layout verticalAlignment="middle">
    {#if state === AppState.ScanForInfo}
      <label
        class="message"
        text="Please hold your Mobile Phone near a Baltech Reader" />
      <!-------------------------------->
    {:else if state === AppState.ShowReaderInfo}
      <label class="message" text="State of Detected Reader" />
      <label class="label" text="SerialNo" />
      <label class="data" text={readerInfo.fwString.slice(32, 40)} />
      <label class="label" text="Firmware" />
      <label class="data" text={readerInfo.fwString.slice(0, 31)} />
      {#if readerInfo.cfgId}
        <label class="label" text="Configuration" />
        {#if readerInfo.cfgId.slice(0, 5) === "99999"}
          <label class="data" text={readerInfo.cfgName} />
        {:else}
          <label class="data" text="{readerInfo.cfgId} {readerInfo.cfgName}" />
        {/if}
      {/if}
      {#if readerInfo.bootStatus}
        <label class="label" text="BootStatus" />
        <label class="data" text={readerInfo.bootStatus} />
      {/if}
      <!-------------------------------->
    {:else if state === AppState.ScanForUpdate}
      <label
        class="message"
        text="Please hold your Mobile Phone near a Baltech reader" />
      <label class="message" text="to load the following BEC2 File" />
      {#if bec2File.header["FirmwareId"] && bec2File.header["FirmwareVersion"]}
        <label class="label" text="Firmware" />
        <label class="data" text={fullFirmwareId} />
      {/if}
      {#if bec2File.header["Configuration"]}
        <label class="label" text="Configuration" />
        <label class="data" text={bec2File.header["Configuration"]} />
      {/if}
      <button text="Read Reader Info" on:tap={restartInfoScanning} />
      <!-------------------------------->
    {:else if state === AppState.Updating || state === AppState.ConnectionLost}
      <label class="message" text="Transferring BEC2 file..." />
      <label class="label" text="Please do not remove Mobile Phone" />
      <label class="label" text="Progress" />
      <label
        class="data"
        text="{progress ? (progress * 100).toFixed(0) : 0}%" />
      <label class="label" text="Transferred data" />
      <label class="data" text="{(transBytes / 1024).toFixed(1)} kB" />
      {#if state === AppState.ConnectionLost}
        <label class="fail" text="Connection Lost!" />
        <label class="fail" text="Please Realign Handy" />
      {/if}
      <!-------------------------------->
    {:else if state === AppState.UpdatedSuccessfully || state === AppState.UpdateFailure}
      {#if state === AppState.UpdatedSuccessfully}
        <label class="message" text="BEC2 file transferred successfully" />
      {:else if state === AppState.UpdateFailure}
        <label class="message" text="Failed to transfer BEC2 file" />
        <label class="label" text="Error Code" />
        <label class="data" text={FinishCode[failureCode]} />
      {/if}
      <button text="Scan for next Reader to update" on:tap={restartScanning} />
      <button text="Read Reader Info" on:tap={restartInfoScanning} />
    {/if}
  </stack-layout>
</page>

<style>
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
</style>
