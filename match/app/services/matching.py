def personality_similarity(u1, u2):
    """
    Сравнивает двух пользователей по personality.
    Возвращает число от 0 до 1:
    - 1 = очень похожи
    - 0 = максимально различаются
    """

    # веса важности пяти черт:
    # O, C, E, A, N
    weights = [0.15, 0.20, 0.20, 0.25, 0.20]

    # distance = общая "дистанция" между личностями
    distance = 0

    # проходим по всем пяти координатам personality
    for i in range(5):
        # абсолютная разница между значениями черты
        diff = abs(u1.personality[i] - u2.personality[i])

        # учитываем важность черты
        distance += weights[i] * diff

    # превращаем дистанцию в похожесть
    return 1 - distance


def interests_similarity(u1, u2):
    """
    Сравнивает интересы двух пользователей через индекс Жаккара.
    """

    # общие интересы
    intersection = u1.interests & u2.interests

    # все уникальные интересы обоих пользователей
    union = u1.interests | u2.interests

    # если интересов вообще нет, возвращаем 0
    if len(union) == 0:
        return 0

    return len(intersection) / len(union)


def total_similarity(u1, u2, alpha=0.7, beta=0.3):
    """
    Итоговая совместимость двух пользователей.
    alpha = вес personality
    beta = вес interests
    """

    s1 = personality_similarity(u1, u2)
    s2 = interests_similarity(u1, u2)

    return alpha * s1 + beta * s2


def average_personality(event):
    """
    Считает средний personality всех участников события.
    Возвращает список из 5 чисел.
    """

    # если участников нет, возвращаем нейтральный personality
    if len(event.participants) == 0:
        return [0.5, 0.5, 0.5, 0.5, 0.5]

    # список из 5 нулей, куда будем накапливать суммы
    avg = [0, 0, 0, 0, 0]

    # складываем personality всех участников
    for user in event.participants:
        for i in range(5):
            avg[i] += user.personality[i]

    # делим каждую сумму на количество участников
    count = len(event.participants)
    return [value / count for value in avg]


def event_interests_similarity(user, event):
    """
    Сравнивает интересы пользователя с тегами события.
    Тоже через индекс Жаккара.
    """

    intersection = user.interests & event.tags
    union = user.interests | event.tags

    if len(union) == 0:
        return 0

    return len(intersection) / len(union)


def event_personality_similarity(user, event):
    """
    Сравнивает personality пользователя со средним personality группы события.
    """

    avg_personality = average_personality(event)

    # веса важности пяти черт
    weights = [0.15, 0.20, 0.20, 0.25, 0.20]

    distance = 0

    # считаем расстояние между user.personality и avg_personality
    for i in range(5):
        diff = abs(user.personality[i] - avg_personality[i])
        distance += weights[i] * diff

    return 1 - distance


def event_similarity(user, event, alpha=0.7, beta=0.3):
    """
    Итоговая совместимость пользователя с событием.
    alpha = вес personality
    beta = вес интересов/тегов
    """

    s_personality = event_personality_similarity(user, event)
    s_interests = event_interests_similarity(user, event)

    return alpha * s_personality + beta * s_interests


def recommend_events_for_user(user, events, participant_resolver, alpha=0.7, beta=0.3):
    """
    Строит рекомендации событий для пользователя.

    user - объект User
    events - список словарей событий из events-service
    participant_resolver - функция, которая по user_id возвращает объект User

    Возвращает список событий с match_score, отсортированный по убыванию score.
    """

    recommendations = []

    for event_data in events:
        participants = []

        # превращаем id участников события в объекты User
        for participant_id in event_data["participants"]:
            participant = participant_resolver(participant_id)
            participants.append(participant)

        # создаём внутренний объект Event
        from app.models.event import Event

        event = Event(
            id=event_data["id"],
            tags=event_data["tags"],
            participants=participants
        )

        score = event_similarity(user, event, alpha=alpha, beta=beta)

        recommendations.append({
            "event_id": event_data["id"],
            "title": event_data["title"],
            "tags": event_data["tags"],
            "participants": event_data["participants"],
            "match_score": score
        })

    # сортируем по убыванию score
    recommendations.sort(key=lambda item: item["match_score"], reverse=True)

    return recommendations