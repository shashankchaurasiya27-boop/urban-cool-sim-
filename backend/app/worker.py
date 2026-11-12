"""
UrbanCoolSim Worker Module (Deprecated / Removed)

Per architecture remediation decision C-3/C-4:
Background Celery/Redis workers have been removed. All Surface Energy Balance
physics simulations and NSGA-II multi-objective optimization sweeps execute
synchronously inside FastAPI request handlers with concurrency control.
"""

# Dead code paths removed. File kept as a tombstone/notice.
