"""chat-completions endpoint: validation + missing-model handling.

The actual streaming path is exercised by integration tests against a running
llama-server; here we verify the request shape and the model-not-ready guard.
"""
from __future__ import annotations

import json

import pytest
from django.test import Client


@pytest.mark.django_db
def test_chat_completions_requires_post():
    r = Client().get("/v1/chat/completions")
    assert r.status_code == 405


@pytest.mark.django_db
def test_chat_completions_validates_body():
    r = Client().post(
        "/v1/chat/completions",
        data=json.dumps({"model": "x"}),
        content_type="application/json",
    )
    assert r.status_code == 400
    assert "messages" in r.json()["error"]


@pytest.mark.django_db
def test_chat_completions_rejects_missing_model_slug():
    r = Client().post(
        "/v1/chat/completions",
        data=json.dumps({"model": "", "messages": [{"role": "user", "content": "hi"}]}),
        content_type="application/json",
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_chat_completions_404_when_model_not_downloaded():
    r = Client().post(
        "/v1/chat/completions",
        data=json.dumps(
            {"model": "nonexistent", "messages": [{"role": "user", "content": "hi"}]}
        ),
        content_type="application/json",
    )
    assert r.status_code == 404
    assert r.json()["code"] == "model_not_ready"
