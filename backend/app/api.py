"""The FastAPI shell. All behaviour lives in http.Dispatcher (framework-free and fully tested); this file only adapts
ASGI requests to it, adds CORS and runs the database migrations at start-up."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .db import migrate
from .http import API_PREFIX, ROUTES, Dispatcher, HttpRequest, Route, json_response, make_db_factory

VERSION = "0.4.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    dispatcher = Dispatcher(settings, make_db_factory(settings))

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        with dispatcher.db_factory() as db:
            migrate(db, settings.migrations_dir)
        yield

    app = FastAPI(title="FormFit API", version=VERSION, lifespan=lifespan, docs_url=f"{API_PREFIX}/docs", openapi_url=f"{API_PREFIX}/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    def endpoint_for(route: Route) -> Callable[[Request], Awaitable[Response]]:
        async def endpoint(request: Request) -> Response:
            declared = request.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > settings.max_body_bytes:
                r = json_response(413, {"error": {"code": "payload_too_large", "message": "The request is too large."}})
                return Response(r.body, status_code=r.status, media_type=r.content_type)
            req = HttpRequest(
                method=request.method,
                path=request.url.path,
                query=dict(request.query_params),
                headers={k.lower(): val for k, val in request.headers.items()},
                body=await request.body(),
                client_ip=request.client.host if request.client else "",
            )
            resp = await run_in_threadpool(dispatcher.handle, req)  # blocking SQL stays off the event loop
            return Response(resp.body, status_code=resp.status, media_type=resp.content_type, headers=resp.headers)

        endpoint.__name__ = route.name
        return endpoint

    for route in ROUTES:
        app.add_api_route(API_PREFIX + route.pattern, endpoint_for(route), methods=[route.method], name=route.name, summary=route.summary, response_model=None)
    return app
