"""Расчёт вектора OCEAN [O,C,E,A,N] в диапазоне [0,1] из ответов 1..5."""

from __future__ import annotations

from app.services.bfi_questions import BfiItem, TRAIT_INDEX


def _norm(answer: int, reverse: bool) -> float:
    v = (float(answer) - 1.0) / 4.0
    if reverse:
        return 1.0 - v
    return v


def score_from_answers(answers: dict[str, int], questions: tuple[BfiItem, ...]) -> list[float]:
    """Усреднение по вопросам каждой оси; порядок — openness, conscientiousness, extraversion, agreeableness, neuroticism."""
    buckets: dict[str, list[float]] = {t: [] for t in "OCEAN"}
    for q in questions:
        a = answers.get(q.code)
        if a is None:
            raise ValueError(f"missing answer for {q.code}")
        if not isinstance(a, int) or a < 1 or a > 5:
            raise ValueError(f"invalid answer for {q.code}")
        buckets[q.trait].append(_norm(a, q.reverse))
    vec: list[float] = [0.0, 0.0, 0.0, 0.0, 0.0]
    for letter, idx in TRAIT_INDEX.items():
        vals = buckets[letter]
        if not vals:
            vec[idx] = 0.5
        else:
            vec[idx] = sum(vals) / len(vals)
    return vec


def apply_vector_to_profile(profile, vec: list[float]) -> None:
    profile.openness = vec[0]
    profile.conscientiousness = vec[1]
    profile.extraversion = vec[2]
    profile.agreeableness = vec[3]
    profile.neuroticism = vec[4]
