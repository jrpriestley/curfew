"""curfew: block devices from the internet, by hand, by profile and on schedules.

Runs on the house router (homehub). Devices come from isc-dhcp-server's
leases; blocking happens in nftables (cutting internet, never the LAN) and,
for a profile's blocked sites, in Pi-hole. A web page (``curfew serve``) and
a command line (``curfew status``, ``curfew pause kids 30m`` ...) share one
saved state; ``curfew sync`` runs every minute to keep schedules on time and
to log usage.
"""

__version__ = "1.120.0"
