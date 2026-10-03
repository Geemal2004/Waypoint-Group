from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_service_declares_assisted_solver_and_deferred_ml():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["solverReady"] is True
    assert response.json()["modelReady"] is False


def test_missing_road_contract_never_returns_fake_allocation():
    response = client.post("/v1/plans", json={})
    assert response.status_code == 422
