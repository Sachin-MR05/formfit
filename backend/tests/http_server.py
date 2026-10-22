"""A zero-dependency HTTP server around http.Dispatcher. Used by tests (and by the TypeScript sync client's
integration test) so the real wire format is exercised without FastAPI. NOT for production."""
from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

from app.http import Dispatcher, HttpRequest


def make_handler(dispatcher: Dispatcher):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _serve(self) -> None:
            parts = urlsplit(self.path)
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""
            req = HttpRequest(
                method=self.command, path=parts.path, query=dict(parse_qsl(parts.query)),
                headers={k.lower(): v for k, v in self.headers.items()}, body=body, client_ip=self.client_address[0],
            )
            resp = dispatcher.handle(req)
            self.send_response(resp.status)
            self.send_header("Content-Type", resp.content_type)
            self.send_header("Content-Length", str(len(resp.body)))
            for k, val in resp.headers.items():
                self.send_header(k, val)
            self.end_headers()
            self.wfile.write(resp.body)

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _serve

        def log_message(self, *_args) -> None:  # keep test output quiet
            pass

    return Handler


def serve(dispatcher: Dispatcher, port: int = 0) -> tuple[ThreadingHTTPServer, str]:
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(dispatcher))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"
