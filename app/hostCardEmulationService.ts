export interface EmulatedCard {
  powerUp(): void;
  processApdu(input: number[]|Uint8Array): number[]|Uint8Array;
}

let activeEmulatedCard: EmulatedCard = null;
let activeHf = false;

export function activateEmulatedCard(emuCard: EmulatedCard) {
  activeEmulatedCard = emuCard;
  if (activeEmulatedCard && activeHf) emuCard.powerUp();
}

@NativeClass()
@JavaProxy("de.baltech.HostCardEmulationService")
class HostCardEmulationService extends android.nfc.cardemulation
  .HostApduService {
  onDeactivated(reason: number) {
    activeHf = false;
  }

  processCommandApdu(commandApdu: any, extras?: any): any {
    var response;
    if (!activeHf) {
      activeHf = true;
      if (activeEmulatedCard) activeEmulatedCard.powerUp();
    }
    if (!activeEmulatedCard) {
      // ISO7816 STATUS "Instruction code not supported or invalid":
      response = [0x6d, 0x00];
    } else {
      try {
        const commandApduAsJsArray = new Uint8Array(commandApdu);
        response = activeEmulatedCard.processApdu(commandApduAsJsArray);
      } catch (e) {
        console.log(`Host Card Emulation throwed Error "${e}"`);
        // ISO7816 STATUS "Execution Error (State of non-volatile memory unchanged)"
        response = [0x64, 0x00];
      }
    }
    return java.nio.ByteBuffer.wrap(response).array();
  }
}
