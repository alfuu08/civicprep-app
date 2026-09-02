"""
Configuration centralisée de l'application.

TOUT ce que tu dois personnaliser pour faire de cette app la tienne se
trouve dans ce fichier et dans le fichier .env (voir .env.example).
Rien d'autre dans le code n'a besoin d'être modifié pour changer le nom,
l'email de contact ou l'identité légale de l'application.
"""

import os

from dotenv import load_dotenv

load_dotenv()  # lit les variables définies dans le fichier .env


class Config:
    # --- Identité de l'application (à personnaliser) ---------------------
    APP_NAME = "CivicPrep"
    APP_TAGLINE = "Examen & Livret Citoyen"
    CONTACT_EMAIL = "technova.monitoring.lab@gmail.com"

    # Nom qui apparaît dans les mentions légales comme éditeur de l'app.
    EDITOR_NAME = "Baxxtech"

    # --- Secrets (définis dans le fichier .env, jamais codés en dur) -----
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-a-remplacer")
    ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")

    # --- Base de données ---------------------------------------------------
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'civicprep.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- Sécurité des cookies de session -----------------------------------
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    # En production (FLASK_ENV=production dans .env), le cookie de session
    # n'est envoyé que via HTTPS.
    SESSION_COOKIE_SECURE = os.environ.get("FLASK_ENV") == "production"

    # --- Score minimal pour réussir l'examen blanc (sur 40) ----------------
    EXAM_QUESTION_COUNT = 40
    EXAM_PASS_SCORE = 32
