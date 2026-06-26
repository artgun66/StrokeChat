"""Threads CRUD smoke tests."""
from __future__ import annotations

import json

import pytest
from django.test import Client


@pytest.mark.django_db
def test_create_and_list_threads():
    c = Client()
    r = c.post(
        "/api/threads/",
        data=json.dumps({"title": "first", "model_slug": "qwen2.5-7b-instruct-q4"}),
        content_type="application/json",
    )
    assert r.status_code == 201, r.json()
    thread_id = r.json()["id"]

    r = c.get("/api/threads/")
    body = r.json()
    items = body.get("results", body)
    assert len(items) == 1
    assert items[0]["title"] == "first"

    r = c.get(f"/api/threads/{thread_id}/")
    assert r.status_code == 200
    assert r.json()["title"] == "first"


@pytest.mark.django_db
def test_thread_messages_lifecycle():
    c = Client()
    r = c.post("/api/threads/", data=json.dumps({"title": "t"}), content_type="application/json")
    thread_id = r.json()["id"]

    r = c.post(
        f"/api/threads/{thread_id}/messages/",
        data=json.dumps({"role": "user", "content": "hello"}),
        content_type="application/json",
    )
    assert r.status_code == 201, r.json()

    r = c.get(f"/api/threads/{thread_id}/messages/")
    body = r.json()
    items = body.get("results", body)
    assert len(items) == 1
    assert items[0]["role"] == "user"
    assert items[0]["content"] == "hello"
