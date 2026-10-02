from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="Waypoint Planning", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "planning", "solverReady": False, "modelReady": False}


@app.post("/v1/plans")
def plan():
    # Explicitly unavailable until validated dataset contracts and constraints exist.
    return JSONResponse(status_code=501, content={
        "code": "PLANNING_NOT_IMPLEMENTED",
        "message": "Allocation engine is not implemented in the foundation milestone.",
    })
