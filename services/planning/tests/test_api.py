from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_service_does_not_claim_solver_is_ready():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["solverReady"] is False


def test_unimplemented_planner_never_returns_fake_allocation():
    response = client.post("/v1/plans", json={})
    assert response.status_code == 501
    assert response.json()["code"] == "PLANNING_NOT_IMPLEMENTED"
