"""Modèle de données : une question de quiz/examen."""

from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

# Limites appliquées à la validation côté serveur (voir security.py).
MAX_LONGUEUR_QUESTION = 500
MAX_LONGUEUR_OPTION = 200

THEMES = [
    "Principes et valeurs",
    "Institutions",
    "Droits et devoirs",
    "Histoire et culture",
    "Vivre en société",
]


class Question(db.Model):
    __tablename__ = "questions"

    id = db.Column(db.Integer, primary_key=True)
    theme = db.Column(db.String(100), nullable=False)
    texte = db.Column(db.String(MAX_LONGUEUR_QUESTION), nullable=False)
    option_a = db.Column(db.String(MAX_LONGUEUR_OPTION), nullable=False)
    option_b = db.Column(db.String(MAX_LONGUEUR_OPTION), nullable=False)
    option_c = db.Column(db.String(MAX_LONGUEUR_OPTION), nullable=False)
    option_d = db.Column(db.String(MAX_LONGUEUR_OPTION), nullable=False)
    reponse_correcte = db.Column(db.Integer, nullable=False)  # 0=A, 1=B, 2=C, 3=D
    date_creation = db.Column(db.DateTime, default=datetime.utcnow)

    def vers_dict(self):
        """Représentation utilisée par le JavaScript côté client (quiz, examen)."""
        return {
            "id": self.id,
            "theme": self.theme,
            "q": self.texte,
            "options": [self.option_a, self.option_b, self.option_c, self.option_d],
            "answer": self.reponse_correcte,
        }
