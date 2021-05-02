
@NativeClass()
@JavaProxy("com.tns.Bf3UpdateService")
class Bf3UpdateService extends android.nfc.cardemulation.HostApduService {

    onDeactivated(reason: number) {
        console.log("DEACTIVATE NFC");
    }

    processCommandApdu(commandApdu: number[], extras?: any): number[] {
        console.log("SEND APDU:");
        for (let c = 0; c < commandApdu.length; c++)
           console.log((commandApdu[c] & 0xFF).toString(16));
        const byteArray = Array.create('byte',2);
        byteArray[0] = 0x90;
        byteArray[1] = 0x00;
        return byteArray
    }

}

