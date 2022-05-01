export interface EmulatedCard {
  powerUp(): void;
  processApdu(input: number[] | Uint8Array): number[] | Uint8Array;
}

export let _activeEmulatedCard: EmulatedCard = null;
export let _activeHf = false;

export function activateEmulatedCard(emuCard: EmulatedCard) {
  _activeEmulatedCard = emuCard;
  if (_activeEmulatedCard && _activeHf) emuCard.powerUp();
}

export function _setActiveHf(mode: boolean) {
  _activeHf = mode;
}
