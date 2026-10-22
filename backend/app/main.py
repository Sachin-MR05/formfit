"""ASGI entry point:  uvicorn app.main:app --reload"""
from .api import create_app

app = create_app()
