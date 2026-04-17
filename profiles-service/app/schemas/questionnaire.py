from pydantic import BaseModel


class QuestionnaireAnswersBody(BaseModel):
    """Ответы по коду вопроса; значение 1..5."""

    answers: dict[str, int]
