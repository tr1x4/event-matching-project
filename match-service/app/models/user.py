class User:
    def __init__(self, id, personality, interests):
        self.id = id
        self.personality = personality
        self.interests = set(interests)