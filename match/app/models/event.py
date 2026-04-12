class Event:
    def __init__(self, id, tags, participants):
        # id события
        self.id = id

        # теги события, например: sport, music, outdoor
        # храним как множество для удобного сравнения
        self.tags = set(tags)

        # список объектов User, которые уже участвуют в событии
        self.participants = participants