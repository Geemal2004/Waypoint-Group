from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from .allocation import allocate

app = FastAPI(title="Waypoint Planning", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "planning", "solverReady": True, "modelReady": False, "method": "assisted constrained insertion"}


class ProposalInput(BaseModel):
    day: str
    version: int
    orders: list[dict]
    vehicles: list[dict]
    trips: list[dict]
    matrix: dict
    fleetStatus: list[dict]
    districtBudgets: list[dict]
    loaderId: str
    nextDay: str
    freshOnlyReefers: bool = True
    turnaroundMinutes: int = 30

@app.post("/v1/plans")
def plan(data: ProposalInput):
    try:
        return allocate(data.model_dump())
    except (ValueError, KeyError, TypeError) as error:
        return JSONResponse(status_code=422,content={"code":"INVALID_PLANNING_INPUT","message":str(error)})
