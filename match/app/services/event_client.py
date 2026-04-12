import requests

BASE_URL = "http://127.0.0.1:8002"

session = requests.Session()
session.trust_env = False


def get_events():
    """
    Получает список всех событий из events-service.
    """

    url = f"{BASE_URL}/events"

    print("REQUEST EVENTS URL:", url)

    response = session.get(url, timeout=5)

    print("EVENTS STATUS:", response.status_code)
    print("EVENTS BODY:", response.text)

    if response.status_code != 200:
        raise Exception(
            f"Failed to fetch events. "
            f"Status: {response.status_code}. Body: {response.text}"
        )

    return response.json()