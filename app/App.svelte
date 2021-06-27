<script lang="typescript">
  import registerContentHandler from "./viewIntentHandler";
  import Bec2File from "./bec2Format";
  import {
    Bec2OverNfcSession,
    FinishCode,
    ReaderInfo,
  } from "./bec2OverNfcSession";
  import { activateEmulatedCard } from "./hostCardEmulationService";

  let message: string = "No File Opened";

  activateEmulatedCard(
    new Bec2OverNfcSession(null, null, (readerInfo) => {
      message =
        `Detected Device\n\n` +
        `Firmware: ${readerInfo.fwString}\n` +
        `Config: ${readerInfo.cfgId}\n` +
        `BootStatus: ${readerInfo.bootStatus.toString(16).padStart(8, "0")}\n`;
    })
  );

  registerContentHandler((bec2FileAsText) => {
    const bec2File = Bec2File.parse(bec2FileAsText);
    const hdr = bec2File.header;
    message =
      "Loading...\n\n" +
      (hdr["FirmwareId"]
        ? `Firmware: ${hdr["FirmwareId"]} ${hdr["FirmwareVersion"]}\n`
        : "") +
      (hdr["Configuration"] ? `Configuration: ${hdr["Configuration"]}\n` : "");
    activateEmulatedCard(
      new Bec2OverNfcSession(bec2File.content, (finishCode: FinishCode) => {
        message = `Firmware Loaded\nResultcode:${finishCode}`;
      })
    );
  });
</script>

<page>
  <actionBar title="Svelte Native App" />
  <gridLayout>
    <label
      class="info"
      horizontalAlignment="center"
      verticalAlignment="middle"
      textWrap="true">
      <formattedString>
        <span class="fas" text="&#xf135;" />
        <span text=" {message}" />
      </formattedString>
    </label>
  </gridLayout>
</page>

<style>
  .info .fas {
    color: #3a53ff;
  }
  .info {
    font-size: 20;
  }
</style>
