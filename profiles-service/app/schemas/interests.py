from pydantic import BaseModel, Field


class InterestsPutBody(BaseModel):
    interest_ids: list[int] = Field(default_factory=list, max_length=30)
