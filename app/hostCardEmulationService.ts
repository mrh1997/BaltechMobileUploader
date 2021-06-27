export interface EmulatedCard {
  powerUp(): void;
  processApdu(input: number[]): number[];
}

let activeEmulatedCard: EmulatedCard = null;
let activeHf = false;

export function activateEmulatedCard(emuCard: EmulatedCard) {
  activeEmulatedCard = emuCard;
  emuCard.powerUp();
}

@NativeClass()
@JavaProxy("de.baltech.HostCardEmulationService")
class HostCardEmulationService extends android.nfc.cardemulation
  .HostApduService {
  onDeactivated(reason: number) {
    activeHf = false;
  }

  processCommandApdu(commandApdu: number[], extras?: any): number[] {
    var response;
    if (!activeEmulatedCard) {
      // ISO7816 STATUS "Instruction code not supported or invalid":
      response = [0x6d, 0x00];
    } else {
      if (!activeHf) {
        activeEmulatedCard.powerUp();
        activeHf = true;
      }
      try {
        const commandApduWithoutNegNumbers = Array.from(commandApdu).map(
          (c) => (c + 0x100) % 0x100
        );
        response = activeEmulatedCard.processApdu(commandApduWithoutNegNumbers);
      } catch (e) {
        // ISO7816 STATUS "Execution Error (State of non-volatile memory unchanged)"
        response = [0x64, 0x00];
      }
    }
    const responseJArray = Array.create("byte", response.length);
    response.forEach((val, ndx) => {
      responseJArray[ndx] = val;
    });
    return responseJArray;
  }
}