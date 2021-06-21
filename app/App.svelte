<script lang="typescript">
  import registerContentHandler from "./viewIntentHandler";
  import Bec2File from "./bec2Format";

  let message: string = "No File Opened";

  registerContentHandler((bec2FileAsText) => {
    const bec2File = Bec2File.parse(bec2FileAsText);
    const hdr = bec2File.header;
    message = `Firmware: ${hdr["FirmwareId"]} ${hdr["FirmwareVersion"]}`;
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
