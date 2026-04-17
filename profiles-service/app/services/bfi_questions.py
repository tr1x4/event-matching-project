"""Вопросы короткой (15) и полной (50) анкеты Big Five — коды и признаки как в ТЗ."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BfiItem:
    code: str
    trait: str  # O C E A N
    reverse: bool
    text_ru: str


# Порядок осей вектора personality: [O, C, E, A, N]
TRAIT_INDEX = {"O": 0, "C": 1, "E": 2, "A": 3, "N": 4}

FAST_QUESTIONS: tuple[BfiItem, ...] = (
    BfiItem("FAST_E1", "E", False, "Мне легко начинать разговор с незнакомыми людьми."),
    BfiItem("FAST_E2", "E", False, "В компании я обычно веду себя активно и заметно."),
    BfiItem("FAST_E3", "E", True, "Я предпочитаю держаться в стороне и не привлекать внимания."),
    BfiItem("FAST_A1", "A", False, "Мне важно учитывать чувства других людей."),
    BfiItem("FAST_A2", "A", False, "Я стараюсь поддерживать людей, когда им тяжело."),
    BfiItem("FAST_A3", "A", True, "Чужие проблемы обычно меня мало волнуют."),
    BfiItem("FAST_C1", "C", False, "Я обычно планирую дела заранее."),
    BfiItem("FAST_C2", "C", False, "Я стараюсь доводить начатое до конца."),
    BfiItem("FAST_C3", "C", True, "У меня часто бывает беспорядок в делах или вещах."),
    BfiItem("FAST_N1", "N", False, "Я легко начинаю переживать из-за мелочей."),
    BfiItem("FAST_N2", "N", False, "Моё настроение может быстро меняться."),
    BfiItem("FAST_N3", "N", True, "Обычно я остаюсь спокойным даже в стрессовых ситуациях."),
    BfiItem("FAST_O1", "O", False, "Мне нравится пробовать новое и необычное."),
    BfiItem("FAST_O2", "O", False, "Мне интересно размышлять над сложными идеями."),
    BfiItem("FAST_O3", "O", True, "Я предпочитаю только привычные занятия и решения."),
)

LONG_QUESTIONS: tuple[BfiItem, ...] = (
    BfiItem("LONG_E1", "E", False, "Я душа компании."),
    BfiItem("LONG_E2", "E", True, "Я говорю не очень много."),
    BfiItem("LONG_E3", "E", False, "Я чувствую себя комфортно среди людей."),
    BfiItem("LONG_E4", "E", True, "Я обычно остаюсь в тени."),
    BfiItem("LONG_E5", "E", False, "Я сам начинаю разговор."),
    BfiItem("LONG_E6", "E", True, "Мне обычно нечего сказать."),
    BfiItem("LONG_E7", "E", False, "На встречах и мероприятиях я общаюсь с разными людьми."),
    BfiItem("LONG_E8", "E", True, "Я не люблю привлекать к себе внимание."),
    BfiItem("LONG_E9", "E", False, "Мне нормально быть в центре внимания."),
    BfiItem("LONG_E10", "E", True, "Я тихо веду себя среди незнакомых людей."),
    BfiItem("LONG_A1", "A", True, "Меня мало волнуют другие люди."),
    BfiItem("LONG_A2", "A", False, "Мне интересны люди."),
    BfiItem("LONG_A3", "A", True, "Я могу грубо задевать людей словами."),
    BfiItem("LONG_A4", "A", False, "Я сопереживаю чувствам других."),
    BfiItem("LONG_A5", "A", True, "Меня не очень волнуют чужие проблемы."),
    BfiItem("LONG_A6", "A", False, "У меня мягкий характер."),
    BfiItem("LONG_A7", "A", True, "Я не особенно интересуюсь другими."),
    BfiItem("LONG_A8", "A", False, "Я нахожу время для других людей."),
    BfiItem("LONG_A9", "A", False, "Я чувствую эмоции других людей."),
    BfiItem("LONG_A10", "A", False, "Рядом со мной людям обычно спокойно."),
    BfiItem("LONG_C1", "C", False, "Я всегда стараюсь быть подготовленным."),
    BfiItem("LONG_C2", "C", True, "Я оставляю вещи где попало."),
    BfiItem("LONG_C3", "C", False, "Я внимателен к деталям."),
    BfiItem("LONG_C4", "C", True, "Я создаю беспорядок."),
    BfiItem("LONG_C5", "C", False, "Я сразу делаю то, что нужно сделать."),
    BfiItem("LONG_C6", "C", True, "Я часто забываю класть вещи на место."),
    BfiItem("LONG_C7", "C", False, "Мне нравится порядок."),
    BfiItem("LONG_C8", "C", True, "Я уклоняюсь от обязанностей."),
    BfiItem("LONG_C9", "C", False, "Я следую расписанию."),
    BfiItem("LONG_C10", "C", False, "Я требователен к качеству своей работы."),
    BfiItem("LONG_N1", "N", False, "Я легко начинаю нервничать."),
    BfiItem("LONG_N2", "N", True, "Я большую часть времени спокоен."),
    BfiItem("LONG_N3", "N", False, "Я часто переживаю из-за разных вещей."),
    BfiItem("LONG_N4", "N", True, "У меня редко бывает подавленное настроение."),
    BfiItem("LONG_N5", "N", False, "Меня легко выбить из равновесия."),
    BfiItem("LONG_N6", "N", False, "Я легко расстраиваюсь."),
    BfiItem("LONG_N7", "N", False, "Моё настроение часто меняется."),
    BfiItem("LONG_N8", "N", False, "Я легко раздражаюсь."),
    BfiItem("LONG_N9", "N", False, "Я часто чувствую грусть или упадок."),
    BfiItem("LONG_N10", "N", True, "Обычно я эмоционально устойчив."),
    BfiItem("LONG_O1", "O", False, "У меня богатый словарный запас."),
    BfiItem("LONG_O2", "O", True, "Мне трудно понимать абстрактные идеи."),
    BfiItem("LONG_O3", "O", False, "У меня живое воображение."),
    BfiItem("LONG_O4", "O", True, "Абстрактные идеи мне неинтересны."),
    BfiItem("LONG_O5", "O", False, "У меня часто появляются хорошие идеи."),
    BfiItem("LONG_O6", "O", True, "У меня слабое воображение."),
    BfiItem("LONG_O7", "O", False, "Я быстро схватываю сложные вещи."),
    BfiItem("LONG_O8", "O", False, "Я люблю размышлять и анализировать."),
    BfiItem("LONG_O9", "O", False, "Мне интересно узнавать новое даже без практической пользы."),
    BfiItem("LONG_O10", "O", False, "Я полон новых идей."),
)

FAST_CODES = frozenset(q.code for q in FAST_QUESTIONS)
LONG_CODES = frozenset(q.code for q in LONG_QUESTIONS)
