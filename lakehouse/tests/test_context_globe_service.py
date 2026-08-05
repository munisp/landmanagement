from __future__ import annotations

from email.message import Message
import os
from urllib.error import HTTPError

import pytest

from context_globe.service import (
    ContextIngestionError,
    NWS_ALERT_URL,
    USGS_SEISMIC_URL,
    _publish_dapr,
    fetch_source,
    normalize_nws,
    normalize_usgs,
)


class FakeResponse:
    def __init__(self, body: bytes, status: int = 200, headers: dict[str, str] | None = None):
        self._body = body
        self._status = status
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value

    def getcode(self) -> int:
        return self._status

    def read(self, _limit: int) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def usgs_feature() -> dict:
    return {
        "id": "us7000test",
        "geometry": {"type": "Point", "coordinates": [-122.5, 47.6, 10]},
        "properties": {
            "time": 1735689600000,
            "updated": 1735689660000,
            "mag": 2.7,
            "place": "10 km NE of Example",
            "type": "earthquake",
            "url": "https://earthquake.usgs.gov/example",
        },
    }


def nws_feature() -> dict:
    return {
        "id": "https://api.weather.gov/alerts/test",
        "geometry": {"type": "Polygon", "coordinates": [[[-97.0, 38.0], [-96.0, 38.0], [-96.0, 39.0], [-97.0, 38.0]]]},
        "properties": {
            "@id": "https://api.weather.gov/alerts/test",
            "sent": "2025-01-01T00:00:00+00:00",
            "effective": "2025-01-01T00:01:00+00:00",
            "expires": "2025-01-01T06:00:00+00:00",
            "event": "Severe Thunderstorm Warning",
            "severity": "Severe",
            "urgency": "Immediate",
            "certainty": "Observed",
            "headline": "Test warning",
        },
    }


def test_normalizes_usgs_event_with_point_and_bounded_properties():
    event = normalize_usgs(usgs_feature())
    assert event.source_event_key == "us7000test"
    assert event.geometry["type"] == "Point"
    assert event.bbox == [-122.5, 47.6, -122.5, 47.6]
    assert event.properties["mag"] == 2.7
    assert event.source_observed_at.isoformat() == "2025-01-01T00:00:00+00:00"


def test_normalizes_nws_event_with_expiry_and_polygon():
    event = normalize_nws(nws_feature())
    assert event.source_event_key.endswith("/test")
    assert event.severity == "Severe"
    assert event.urgency == "Immediate"
    assert event.expires_at is not None
    assert event.bbox == [-97.0, 38.0, -96.0, 39.0]


@pytest.mark.parametrize("normalizer,feature", [(normalize_usgs, usgs_feature()), (normalize_nws, nws_feature())])
def test_rejects_malformed_feature_geometry(normalizer, feature):
    feature["geometry"] = {"type": "Point", "coordinates": [999, 999]}
    # Coordinates outside world bounds are not accepted into a spatial event catalog.
    with pytest.raises(ContextIngestionError):
        normalizer(feature)


def test_rejects_nonapproved_source_layer():
    with pytest.raises(ContextIngestionError, match="not approved"):
        fetch_source("unapproved", None, None)


def test_conditional_fetch_accepts_not_modified_without_body(monkeypatch):
    monkeypatch.setenv("CONTEXT_NWS_USER_AGENT", "IDLR Context Globe (ops@example.invalid)")

    def opener(request, timeout):
        assert request.full_url == USGS_SEISMIC_URL
        assert request.get_header("If-none-match") == '"version-a"'
        headers = Message()
        headers["ETag"] = '"version-a"'
        raise HTTPError(request.full_url, 304, "not modified", headers, None)

    result = fetch_source("seismic", '"version-a"', None, opener=opener)
    assert result.status == 304
    assert result.body is None
    assert result.etag == '"version-a"'


def test_weather_fetch_uses_only_fixed_nws_endpoint(monkeypatch):
    monkeypatch.setenv("CONTEXT_NWS_USER_AGENT", "IDLR Context Globe (ops@example.invalid)")

    def opener(request, timeout):
        assert request.full_url == NWS_ALERT_URL
        assert "ops@example.invalid" in request.get_header("User-agent")
        return FakeResponse(b'{"type":"FeatureCollection","features":[]}', headers={"ETag": '"nws-v1"'})

    result = fetch_source("weather-alerts", None, None, opener=opener)
    assert result.status == 200
    assert result.etag == '"nws-v1"'


def test_dapr_publication_rejects_unsafe_pubsub_name(monkeypatch):
    monkeypatch.setenv("DAPR_HTTP_ENDPOINT", "http://dapr:3500")
    monkeypatch.setenv("CONTEXT_DAPR_PUBSUB", "pubsub/escape")
    with pytest.raises(ContextIngestionError, match="CONTEXT_DAPR_PUBSUB is invalid"):
        _publish_dapr("seismic", "run-1", 1)


def test_source_constants_are_https_and_fixed():
    assert USGS_SEISMIC_URL.startswith("https://earthquake.usgs.gov/")
    assert NWS_ALERT_URL == "https://api.weather.gov/alerts/active"
