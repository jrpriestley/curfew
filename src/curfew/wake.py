"""Wake-on-LAN: the "magic packet" that wakes a sleeping computer from the house side."""

import socket

from curfew.config import LAN_INTERFACE

WAKE_PORT = 9  # "discard": what wake-on-LAN tools use by convention


def magic_packet(mac: str) -> bytes:
    """Return the packet a network card listens for: six 0xff bytes, then its MAC 16 times."""
    return b"\xff" * 6 + bytes.fromhex(mac.replace(":", "")) * 16


def wake(mac: str) -> None:
    """Broadcast a wake-up for ``mac`` on the house network (raises OSError if it can't).

    The card answers only if the device is set up for it (usually wired, with
    wake-on-LAN on in its settings); nothing comes back either way.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
        sender.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        # Bound to the LAN side, so the broadcast never leaves by the WAN or VPN.
        sender.setsockopt(socket.SOL_SOCKET, socket.SO_BINDTODEVICE, LAN_INTERFACE.encode())
        sender.sendto(magic_packet(mac), ("255.255.255.255", WAKE_PORT))
