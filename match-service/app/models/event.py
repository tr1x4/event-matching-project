class Event:
    def __init__(self, id, tags, participants, creator_profile_id=None):
        self.id = id
        self.tags = set(tags)
        self.participants = participants
        # id профиля создателя (для вектора личности при ровно одном участнике)
        self.creator_profile_id = creator_profile_id
