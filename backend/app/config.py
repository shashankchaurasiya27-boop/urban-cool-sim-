import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator

OLD_INSECURE_SECRET_KEY = "urbancoolsim_super_secret_jwt_key_32_bytes_long_change_in_prod!"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )

    PROJECT_NAME: str = "UrbanCoolSim"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment
    ENVIRONMENT: str = Field(default="development")
    DEBUG: bool = Field(default=True)
    
    # Security & Auth: SECRET_KEY must be set in the environment and must not match the old default
    SECRET_KEY: str = Field(default=...)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./urbancoolsim.db"
    )
    SYNC_DATABASE_URL: str = Field(
        default="sqlite:///./urbancoolsim.db"
    )
    
    # Task Queue / Concurrency limits
    MAX_CONCURRENT_SIMULATIONS: int = 4
    
    # Computational Safety & Resource Constraints
    MAX_SIMULATION_CELLS: int = 1000000  # Max 1 million grid cells per simulation
    MAX_OPTIMIZATION_ITERATIONS: int = 200
    MAX_POPULATION_SIZE: int = 100  # Aligned across config and Pydantic schemas
    JOB_TIMEOUT_SECONDS: int = 600  # 10 minutes
    RATE_LIMIT_PER_MINUTE: int = 60
    
    # Storage
    STORAGE_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            v_clean = v.strip()
            # Normalize legacy Heroku/Render/Railway postgres:// URI scheme
            if v_clean.startswith("postgres://"):
                v_clean = "postgresql://" + v_clean[len("postgres://"):]
            return v_clean
        return v

    @field_validator("SYNC_DATABASE_URL", mode="before")
    @classmethod
    def normalize_sync_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            v_clean = v.strip()
            if v_clean.startswith("postgres://"):
                v_clean = "postgresql://" + v_clean[len("postgres://"):]
            elif v_clean.startswith("postgresql+asyncpg://"):
                v_clean = "postgresql://" + v_clean[len("postgresql+asyncpg://"):]
            return v_clean
        return v

    @model_validator(mode="after")
    def reconcile_database_urls(self):
        # When deployed to cloud environments where only DATABASE_URL is provided,
        # automatically reconcile SYNC_DATABASE_URL if it remains on the default SQLite URI.
        if "postgres" in self.DATABASE_URL and self.SYNC_DATABASE_URL.startswith("sqlite"):
            sync_url = self.DATABASE_URL
            if sync_url.startswith("postgres://"):
                sync_url = "postgresql://" + sync_url[len("postgres://"):]
            elif sync_url.startswith("postgresql+asyncpg://"):
                sync_url = "postgresql://" + sync_url[len("postgresql+asyncpg://"):]
            self.SYNC_DATABASE_URL = sync_url
        return self

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("SECRET_KEY environment variable must be set and non-empty.")
        if v.strip() == OLD_INSECURE_SECRET_KEY:
            raise ValueError(
                "Insecure default SECRET_KEY detected. You must provide a secure, unique SECRET_KEY in the environment."
            )
        if len(v.strip()) < 16:
            raise ValueError("SECRET_KEY must be at least 16 characters long.")
        return v.strip()

# Create settings instance (may fail if SECRET_KEY is missing/invalid)
try:
    settings = Settings()
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "models"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "reports"), exist_ok=True)
    os.makedirs(os.path.join(settings.STORAGE_DIR, "rasters"), exist_ok=True)
except Exception as e:
    # If not set in environment during script execution, let downstream handle or raise
    raise
