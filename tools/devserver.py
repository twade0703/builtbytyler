#!/usr/bin/env python3
"""Local dev server for builtbytyler.com.

Identical to `python -m http.server` except that it sends `Cache-Control:
no-store` on every response. Without that, a browser happily serves a
stale styles.css or main.js for the rest of a session and you end up
debugging a version of the site that no longer exists on disk.

    python tools/devserver.py [port]

Serves the directory this file's parent lives in (the site root), so it
works no matter where it is launched from.
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter: errors only
        if not args or not str(args[0]).startswith(("GET", "HEAD")) or " 200 " not in " ".join(map(str, args)):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"builtbytyler dev server: http://localhost:{port}  (root: {root})")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
