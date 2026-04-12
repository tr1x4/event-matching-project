import requests

BASE_URL = "http://127.0.0.1:8001"

# создаём отдельную сессию
session = requests.Session()

# запрещаем requests брать прокси из переменных окружения
session.trust_env = False


def get_profile(profile_id: int):
    url = f"{BASE_URL}/profiles/{profile_id}"

    print("REQUEST URL:", url)

    response = session.get(url, timeout=5)

    print("STATUS:", response.status_code)
    print("BODY:", response.text)

    if response.status_code != 200:
        raise Exception(
            f"Failed to fetch profile {profile_id}. "
            f"Status: {response.status_code}. Body: {response.text}"
        )

    return response.json()