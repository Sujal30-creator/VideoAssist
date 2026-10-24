from fastapi.testclient import TestClient


def test_health_endpoint_success(client: TestClient):
    """GET /api/v1/health should return 200 with service metadata and ok status."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "ok"
    assert data["service"] == "videoassist-backend"
    assert data["version"] == "0.1.0"
    assert data["environment"] == "test"
    assert "timestamp" in data


def test_openapi_json_endpoint(client: TestClient):
    """GET /openapi.json should return valid OpenAPI 3.x schema definition."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()

    assert "openapi" in data
    assert "paths" in data
    assert "/api/v1/health" in data["paths"]
    assert "get" in data["paths"]["/api/v1/health"]


def test_swagger_docs_endpoint(client: TestClient):
    """GET /docs should return 200 with HTML Swagger UI page."""
    response = client.get("/docs")
    assert response.status_code == 200
    assert "swagger-ui" in response.text.lower() or "html" in response.headers.get("content-type", "")


def test_redoc_endpoint(client: TestClient):
    """GET /redoc should return 200 with HTML ReDoc page."""
    response = client.get("/redoc")
    assert response.status_code == 200
    assert "redoc" in response.text.lower() or "html" in response.headers.get("content-type", "")


def test_root_endpoint(client: TestClient):
    """GET / should return 200 with root metadata and links."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "VideoAssist Backend Test"
    assert data["health"] == "/api/v1/health"
    assert data["docs"] == "/docs"
