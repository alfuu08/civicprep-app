"""
Application principale CivicPrep.

Comme dans inventaire-app : ce fichier configure Flask et définit les
routes (les pages). La différence clé avec le prototype d'origine est que
les questions vivent maintenant dans une vraie base de données partagée
par tous les visiteurs, et que l'ajout de questions est protégé par un
mot de passe administrateur.
"""

import os
import secrets

from flask import Flask, abort, flash, g, redirect, render_template, request, session, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from config import Config
from models import THEMES, Question, db
from security import admin_requis, connecter_admin, deconnecter_admin, jeton_csrf, jeton_csrf_valide, mot_de_passe_correct
from seed_data import QUESTIONS_INITIALES


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)

    limiter = Limiter(get_remote_address, app=app, default_limits=[])

    with app.app_context():
        db.create_all()
        _initialiser_questions()

    @app.context_processor
    def injecter_identite():
        return {
            "app_name": app.config["APP_NAME"],
            "app_tagline": app.config["APP_TAGLINE"],
            "contact_email": app.config["CONTACT_EMAIL"],
            "editor_name": app.config["EDITOR_NAME"],
            "csrf_token": jeton_csrf,
            "csp_nonce": g.csp_nonce,
        }

    @app.before_request
    def preparer_requete():
        # Un nonce différent à chaque requête : seuls les <script> qui portent
        # ce nonce exact ont le droit de s'exécuter (voir l'en-tête CSP
        # ci-dessous). Un script injecté par un attaquant ne le connaît pas.
        g.csp_nonce = secrets.token_urlsafe(16)

    @app.before_request
    def verifier_csrf():
        if request.method == "POST":
            if not jeton_csrf_valide(request.form.get("csrf_token", "")):
                abort(400, description="Jeton de sécurité invalide ou expiré. Rechargez la page et réessayez.")

    @app.after_request
    def ajouter_en_tetes_securite(reponse):
        reponse.headers["X-Content-Type-Options"] = "nosniff"
        reponse.headers["X-Frame-Options"] = "DENY"
        reponse.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        reponse.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        reponse.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            f"script-src 'self' 'nonce-{g.csp_nonce}' https://cdn.tailwindcss.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
            "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
            "img-src 'self' data: https://api.qrserver.com; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "object-src 'none'"
        )
        if app.config.get("SESSION_COOKIE_SECURE"):
            reponse.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return reponse

    _enregistrer_routes(app, limiter)
    return app


def _initialiser_questions():
    """Remplit la base avec les questions de départ, au tout premier lancement."""
    if Question.query.count() > 0:
        return
    for q in QUESTIONS_INITIALES:
        db.session.add(
            Question(
                theme=q["theme"],
                texte=q["texte"],
                option_a=q["options"][0],
                option_b=q["options"][1],
                option_c=q["options"][2],
                option_d=q["options"][3],
                reponse_correcte=q["reponse"],
            )
        )
    db.session.commit()


def _enregistrer_routes(app, limiter):

    @app.route("/")
    def accueil():
        questions = [q.vers_dict() for q in Question.query.all()]
        return render_template("index.html", questions=questions, themes=THEMES)

    @app.route("/admin/connexion", methods=["GET", "POST"])
    @limiter.limit("5 per minute")
    def admin_login():
        if request.method == "POST":
            if mot_de_passe_correct(request.form.get("mot_de_passe", "")):
                connecter_admin()
                flash("Connexion réussie.", "success")
                return redirect(url_for("admin_panel"))
            flash("Mot de passe incorrect.", "danger")
        return render_template("admin_login.html")

    @app.route("/admin/deconnexion")
    def admin_logout():
        deconnecter_admin()
        flash("Vous avez été déconnecté.", "info")
        return redirect(url_for("accueil"))

    @app.route("/admin", methods=["GET", "POST"])
    @admin_requis
    def admin_panel():
        if request.method == "POST":
            erreur = _valider_et_ajouter_question(request.form)
            if erreur:
                flash(erreur, "danger")
            else:
                flash("Question ajoutée avec succès à la base commune.", "success")
                return redirect(url_for("admin_panel"))

        questions = Question.query.order_by(Question.date_creation.desc()).all()
        return render_template("admin_panel.html", themes=THEMES, questions=questions)

    @app.route("/admin/questions/<int:question_id>/supprimer", methods=["POST"])
    @admin_requis
    def admin_supprimer_question(question_id):
        question = Question.query.get_or_404(question_id)
        db.session.delete(question)
        db.session.commit()
        flash("Question supprimée.", "info")
        return redirect(url_for("admin_panel"))


def _valider_et_ajouter_question(form):
    """Validation côté serveur : ne jamais faire confiance aux données du navigateur,
    même si le formulaire les valide déjà côté client."""
    theme = form.get("theme", "").strip()
    texte = form.get("texte", "").strip()
    options = [form.get(f"option_{lettre}", "").strip() for lettre in "abcd"]

    try:
        reponse = int(form.get("reponse_correcte", -1))
    except ValueError:
        reponse = -1

    if theme not in THEMES:
        return "Thématique invalide."
    if not texte or len(texte) > 500:
        return "La question doit faire entre 1 et 500 caractères."
    if any(not opt or len(opt) > 200 for opt in options):
        return "Chaque option doit faire entre 1 et 200 caractères."
    if reponse not in (0, 1, 2, 3):
        return "L'index de la bonne réponse doit être 0, 1, 2 ou 3."

    db.session.add(
        Question(
            theme=theme,
            texte=texte,
            option_a=options[0],
            option_b=options[1],
            option_c=options[2],
            option_d=options[3],
            reponse_correcte=reponse,
        )
    )
    db.session.commit()
    return None


app = create_app()

if __name__ == "__main__":
    # Garde-fou : le mode debug (qui expose une console Python interactive en
    # cas d'erreur) ne doit JAMAIS tourner en production, même par erreur.
    # En déploiement réel (PythonAnywhere), ce bloc n'est de toute façon pas
    # exécuté : le serveur importe directement l'objet `app` ci-dessus.
    mode_debug = os.environ.get("FLASK_ENV") != "production"
    # Port 5001 pour ne pas entrer en conflit avec inventaire-app (port 5000).
    app.run(debug=mode_debug, port=5001)
