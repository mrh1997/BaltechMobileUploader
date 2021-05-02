from baltech.tools.common import buf
from baltech.brp import BrpDevice, HidPort

dev = BrpDevice(HidPort())
dev.VHL.Select(0x0001, Reselect=True)
print dev.VHL.ExchangeAPDU(0, buf("00 A4 04 0C 10 F1 42 61 6C 74 65 63 68 43 6F 6E 66 43 61 72 64")).asStr()
print dev.VHL.ExchangeAPDU(0, buf("00 A4 00 0C 02 00 05")).asStr()
