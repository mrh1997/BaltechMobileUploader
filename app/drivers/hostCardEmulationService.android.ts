import {
  _activeEmulatedCard,
  _activeHf,
  _setActiveHf,
} from "./hostCardEmulationService.common";
export type { EmulatedCard } from "./hostCardEmulationService.common";
export { activateEmulatedCard } from "./hostCardEmulationService.common";

@NativeClass()
@JavaProxy("de.baltech.HostCardEmulationService")
class HostCardEmulationServiceAndroid extends android.nfc.cardemulation
  .HostApduService {
  onDeactivated(reason: number) {
    _setActiveHf(false);
  }

  processCommandApdu(commandApdu: any, extras?: any): any {
    var response;
    if (!_activeHf) {
      _setActiveHf(true);
      if (_activeEmulatedCard) _activeEmulatedCard.powerUp();
    }
    if (!_activeEmulatedCard) {
      // ISO7816 STATUS "Instruction code not supported or invalid":
      response = [0x6d, 0x00];
    } else {
      try {
        const commandApduAsJsArray = new Uint8Array(commandApdu);
        response = _activeEmulatedCard.processApdu(commandApduAsJsArray);
      } catch (e) {
        console.log(`Host Card Emulation throwed Error "${e}"`);
        // ISO7816 STATUS "Execution Error (State of non-volatile memory unchanged)"
        response = [0x64, 0x00];
      }
    }
    return java.nio.ByteBuffer.wrap(response).array();
  }
}
