"""
Sécurité liée à l'espace Admin.

Principe : il n'y a qu'un seul mot de passe administrateur (pas de compte
utilisateur individuel). Ce mot de passe n'est JAMAIS stocké en clair :
seul son "hash" (empreinte à sens unique) est conservé, dans la variable
d'environnement ADMIN_PASSWORD_HASH (voir .env.example et le README pour
la commande qui génère ce hash).
"""

import secrets
from functools import wraps

from flask import current_app, redirect, session, url_for
from werkzeug.security import check_password_hash


def mot_de_passe_correct(mot_de_passe_saisi: str) -> bool:
    hash_attendu = current_app.config["ADMIN_PASSWORD_HASH"]
    if not hash_attendu:
        # Aucun mot de passe configuré : on refuse tout accès plutôt que
        # de laisser passer par défaut (échec fermé, pas ouvert).
        return False
    return check_password_hash(hash_attendu, mot_de_passe_saisi)


def connecter_admin():
    session["admin_connecte"] = True


def deconnecter_admin():
    session.pop("admin_connecte", None)


def jeton_csrf():
    """Retourne le jeton anti-CSRF de la session en cours, en le créant si besoin.

    Ce jeton doit être glissé dans un champ caché de chaque formulaire POST.
    À la soumission, on vérifie qu'il correspond bien à celui de la session :
    un site tiers malveillant qui forcerait un envoi de formulaire depuis le
    navigateur d'un admin connecté ne connaît pas ce jeton, donc sa requête
    est rejetée (voir verifier_csrf dans app.py).
    """
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]


def jeton_csrf_valide(jeton_soumis: str) -> bool:
    jeton_attendu = session.get("csrf_token", "")
    return bool(jeton_soumis) and bool(jeton_attendu) and secrets.compare_digest(jeton_soumis, jeton_attendu)


def admin_requis(vue):
    """Décorateur à poser sur toute route réservée à l'administrateur."""

    @wraps(vue)
    def vue_protegee(*args, **kwargs):
        if not session.get("admin_connecte"):
            return redirect(url_for("admin_login"))
        return vue(*args, **kwargs)

    return vue_protegee
