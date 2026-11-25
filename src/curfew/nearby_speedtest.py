"""Run speedtest-cli against the servers curfew chose; print its --json.

speedtest-cli picks servers from speedtest.net's old list, which places homehub
by its address and can put it a continent away. This runs its test against the
servers on stdin instead (a JSON list, nearest first, each as speedtest.net's
server API gives it plus ``d``, the distance in km), keeping the one that answers
fastest.

It runs with the system's python3, which has speedtest-cli; curfew's venv
doesn't. Run it with ``-I``, so the speedtest module found is speedtest-cli's,
not curfew's speedtest.py next to this file.
"""

import json
import sys

import speedtest


def main() -> None:
    """Test against the stdin servers' fastest; print the result as speedtest-cli --json."""
    servers = json.load(sys.stdin)
    if not servers:
        sys.exit("no servers to test against")
    test = speedtest.Speedtest(secure=True)
    test.servers = {}
    for server in servers:
        test.servers.setdefault(server["d"], []).append(server)
    test.closest = servers
    test.get_best_server(servers)
    test.download()
    test.upload()
    print(test.results.json())


if __name__ == "__main__":
    main()
