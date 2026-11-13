#!/usr/bin/env python3
"""Local preview server for the Luna film header.

Python's built-in server can't send part of a file, so videos can't be seeked with it.
This one answers byte-range requests, like every real host does.

    python3 tools/serve.py [port]        then open http://localhost:4173
"""
from __future__ import annotations

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import BinaryIO

RANGE = re.compile(r"bytes=(\d*)-(\d*)$")
CHUNK = 64 * 1024


class RangeHandler(SimpleHTTPRequestHandler):
    remaining: int | None = None

    def send_head(self) -> BinaryIO | None:
        self.remaining = None
        match = RANGE.match(self.headers.get("Range", "").strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()

        size = os.path.getsize(path)
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        else:  # "bytes=-N": the last N bytes
            start = max(0, size - int(last or 0))
            end = size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        source = open(path, "rb")
        source.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self.remaining = end - start + 1
        return source

    def copyfile(self, source: BinaryIO, outputfile: BinaryIO) -> None:
        try:
            if self.remaining is None:
                super().copyfile(source, outputfile)
                return
            while self.remaining > 0:
                chunk = source.read(min(CHUNK, self.remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                self.remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser cancelled the request, which it does all the time while seeking

    def end_headers(self) -> None:
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = partial(RangeHandler, directory=root)
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Luna film header: http://localhost:{port}  (Ctrl+C to stop)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
