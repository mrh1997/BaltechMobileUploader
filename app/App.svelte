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

  enum State {
    Scanning,
    ShowReaderInfo,
    Bec2SelectedAndScanning,
    Bec2Transferring,
    Bec2Transferred,
    Bec2TransferFailure,
  }
  let state: State;
  let readerInfo: ReaderInfo;
  let bec2File: Bec2File;
  let failureCode: FinishCode;
  let transBytes: number;
  let progress: number;
  let timerId: number;

  function restartScanning() {
    state = State.Bec2SelectedAndScanning;
  }

  function restartInfoScanning() {
    state = State.Scanning;
    activateEmulatedCard(
      new Bec2OverNfcSession(null, null, (ri) => {
        state = State.ShowReaderInfo;
        readerInfo = ri;
        clearTimeout(timerId);
        timerId = setTimeout(() => {
          state = State.Scanning;
        }, 1000);
      })
    );
  }

  restartInfoScanning();

  registerContentHandler((bec2FileAsText) => {
    state = State.Bec2SelectedAndScanning;
    bec2File = Bec2File.parse(bec2FileAsText);
    activateEmulatedCard(
      new Bec2OverNfcSession(
        bec2File.content,
        (finishCode: FinishCode) => {
          activateEmulatedCard(null);
          if (finishCode == FinishCode.Ok) state = State.Bec2Transferred;
          else {
            state = State.Bec2TransferFailure;
            failureCode = finishCode;
          }
        },
        null,
        (_progress: number, _transferredBytes: number) => {
          state = State.Bec2Transferring;
          progress = _progress;
          transBytes = _transferredBytes;
        }
      )
    );
  });

  $: fullFirmwareId = `${bec2File?.header["FirmwareId"]} ${bec2File?.header["FirmwareVersion"]}`;
</script>

<page>
  <action-bar title="Baltech Mobile Uploader" />
  <stack-layout verticalAlignment="middle">
    {#if state === State.Scanning}
      <label
        class="message"
        text="Please hold your Mobile Phone near a Baltech Reader" />
      <!-------------------------------->
    {:else if state === State.ShowReaderInfo}
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
    {:else if state === State.Bec2SelectedAndScanning}
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
    {:else if state === State.Bec2Transferring}
      <label class="message" text="Transferring BEC2 file..." />
      <label class="label" text="Please do not remove Mobile Phone" />
      <label class="label" text="Progress" />
      <label class="data" text="{(progress * 100).toFixed(0)}%" />
      <label class="label" text="Transferred data" />
      <label class="data" text="{(transBytes / 1024).toFixed(1)} kB" />
      <!-------------------------------->
    {:else if state === State.Bec2Transferred || state === State.Bec2TransferFailure}
      {#if state === State.Bec2Transferred}
        <label class="message" text="BEC2 file transferred successfully" />
      {:else if state === State.Bec2TransferFailure}
        <label class="message" text="Failed to transfer BEC2 file" />
        <label class="label" text="Error Code" />
        <label class="data" text={failureCode} />
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
  }
  .message {
    text-align: center;
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
</style>
