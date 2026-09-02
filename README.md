# CivicPrep — de prototype à application en ligne

Application de préparation à l'examen civique français (CSP) : révision
par thème, examen blanc de 40 questions, livret citoyen, espace admin
protégé pour enrichir la base de questions.

Ce document explique **ce qui a changé par rapport au prototype**
(`prepa/indexv2.html.txt`), **pourquoi**, et **ce qu'il te reste à
personnaliser** avant de mettre l'application en ligne.

## 1. Pourquoi cette réécriture ?

Le prototype était une seule page HTML, sans serveur : tout tournait dans
le navigateur. Cela posait trois problèmes bloquants pour une vraie mise
en ligne :

1. **L'espace "Admin" n'était protégé par rien du tout.** N'importe quel
   visiteur pouvait y accéder en cliquant sur l'onglet.
2. **Les questions ajoutées ne servaient à personne d'autre.** Elles
   étaient sauvegardées dans le `localStorage` du navigateur de la
   personne qui les ajoutait — invisibles pour tous les autres visiteurs.
3. **Le texte des questions était inséré tel quel dans la page** (via
   `innerHTML`). Si une question contenait du code malveillant, il se
   serait exécuté chez tous les visiteurs (on appelle ça une faille XSS).

La nouvelle version ajoute un vrai serveur (Flask, comme pour
`inventaire-app`) avec une base de données partagée, un mot de passe
admin réel, et corrige la faille de sécurité ci-dessus.

## 2. Comment la lancer en local

```
cd "civicprep-app"
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

Puis génère tes deux secrets et colle-les dans `.env` :

```
venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```
→ colle le résultat dans `SECRET_KEY=`

```
venv\Scripts\python.exe -c "from werkzeug.security import generate_password_hash; from getpass import getpass; print(generate_password_hash(getpass('Mot de passe admin : ')))"
```
→ tape le mot de passe admin que tu veux utiliser, colle le résultat (qui
commence par `scrypt:` ou `pbkdf2:`) dans `ADMIN_PASSWORD_HASH=`

Enfin, lance le serveur :
```
venv\Scripts\python.exe app.py
```
Ouvre `http://127.0.0.1:5000`. L'espace admin est sur
`http://127.0.0.1:5000/admin` (redirige vers la connexion si besoin).

## 3. Architecture (comme pour inventaire-app)

```
Navigateur <--> app.py (routes) <--> models.py (données) <--> civicprep.db
                      |
                config.py (identité, secrets)
                      |
              templates/*.html (affichage) + static/js/app.js (quiz)
```

- **`config.py`** : LE fichier à modifier pour personnaliser le nom de
  l'app, l'email de contact et l'identité légale (voir section 5).
- **`models.py`** : décrit la table `Question` (thème, texte, 4 options,
  index de la bonne réponse).
- **`security.py`** : vérifie le mot de passe admin (jamais stocké en
  clair, uniquement son empreinte/hash), gère la session de connexion,
  et fournit le décorateur `@admin_requis` qui protège les routes admin.
- **`seed_data.py`** : les 12 questions de départ, insérées une seule
  fois au tout premier lancement (si la base est vide).
- **`app.py`** : les routes. `/` (page publique), `/admin/connexion`,
  `/admin` (protégée), `/admin/questions/<id>/supprimer`.
- **`templates/index.html`** : reprend la mise en page du prototype,
  mais les questions sont désormais injectées depuis la base de données
  (`{{ questions|tojson }}`) au lieu d'être codées en dur dans le HTML.
- **`static/js/app.js`** : la logique du quiz (inchangée dans l'esprit),
  avec une fonction `escapeHtml()` ajoutée partout où du texte de
  question est affiché — c'est le correctif de la faille XSS.

## 4. Ce qui a été corrigé ou ajouté (sécurité & qualité)

| Sujet | Avant (prototype) | Maintenant |
|---|---|---|
| Accès admin | Aucune protection | Mot de passe requis, haché, session sécurisée |
| Ajout de question | `localStorage` local uniquement | Base de données partagée, visible par tous |
| Texte affiché | Injecté tel quel (`innerHTML`) | Échappé (`escapeHtml`) avant affichage |
| Validation | Aucune côté serveur | Longueurs et valeurs vérifiées dans `app.py` |
| Brute-force du mot de passe | Non protégé | 5 tentatives/minute max (Flask-Limiter) |
| Secrets (clé, mot de passe) | Inexistants / en dur | Dans `.env`, jamais commités (`.gitignore`) |
| Cookie de session | Par défaut | `HttpOnly`, `SameSite=Lax`, `Secure` en production |
| Confirmations à l'utilisateur | `alert()` du navigateur | Messages discrets intégrés au design |
| Accessibilité | Icônes sans texte alternatif | `aria-label` ajoutés, focus clavier visible |
| Partage de lien | — | Meta "Open Graph" pour un bel aperçu du lien partagé |
| Falsification de formulaire (CSRF) | Aucune protection | Jeton unique par session, vérifié à chaque envoi de formulaire |
| En-têtes de sécurité HTTP | Aucun | CSP (avec nonce), anti-clickjacking, `nosniff`, `Referrer-Policy` |
| Suppression d'une question | Immédiate, sans confirmation | Boîte de confirmation avant suppression définitive |
| Mode debug Flask | Toujours actif en local | Désactivé automatiquement si `FLASK_ENV=production` |

**Limite connue, à noter honnêtement** : la limitation de débit (`Flask-Limiter`)
utilise pour l'instant un stockage "en mémoire". Cela suffit pour un seul
processus (le cas sur l'offre gratuite de PythonAnywhere), mais se
réinitialise à chaque redémarrage du serveur et ne fonctionnerait plus
correctement si l'app tournait un jour sur plusieurs processus/serveurs en
parallèle. Le jour où le trafic grandit, la suite logique est de brancher
un stockage partagé (Redis) — voir la documentation de Flask-Limiter.

## 5. Ce que TU dois personnaliser avant la mise en ligne

Tout se trouve dans **`config.py`** (valeurs de démonstration à
remplacer) et **`.env`** (secrets) :

- [ ] `APP_NAME` — le nom définitif si tu ne gardes pas "CivicPrep"
- [ ] `CONTACT_EMAIL` — une adresse email que tu surveilles réellement
- [ ] `EDITOR_NAME` — le nom qui apparaît dans les mentions légales
      (ton nom, un pseudonyme de projet, ou une structure existante)
- [ ] `SECRET_KEY` (dans `.env`) — générée une seule fois, à ne jamais
      changer ensuite (sinon tout le monde est déconnecté)
- [ ] `ADMIN_PASSWORD_HASH` (dans `.env`) — le hash de ton mot de passe
      admin, à garder secret

Si l'application traite un jour de vraies données personnelles (comptes
utilisateurs, formulaire de contact...), il faudra revoir la section RGPD
de `templates/index.html` (onglet "Mentions Légales") en conséquence —
pour l'instant, aucune donnée personnelle n'est collectée côté serveur.

## 6. Mettre l'application en ligne (PythonAnywhere, gratuit)

Recommandé pour démarrer : pas de carte bancaire, toujours actif
(contrairement à d'autres hébergeurs gratuits qui "endorment" l'app),
et le fichier `civicprep.db` (SQLite) persiste correctement.

1. Crée un compte gratuit sur [pythonanywhere.com](https://www.pythonanywhere.com).
2. Dans l'onglet **Consoles**, ouvre une console Bash et envoie-y ton
   dossier `civicprep-app` (par exemple via `git clone` si le projet est
   sur GitHub, ou en le zippant et en l'uploadant depuis l'onglet
   **Files**).
3. Toujours en console Bash : `pip install --user -r requirements.txt`
   puis crée le fichier `.env` avec tes vraies valeurs (`nano .env`).
4. Dans l'onglet **Web**, crée une nouvelle "Web app" → Flask → pointe
   vers `app.py`. PythonAnywhere génère un fichier WSGI : remplace son
   contenu par l'import de ton `app` (`from app import app as application`).
5. Clique sur **Reload**. Ton application est en ligne sur
   `https://tonpseudo.pythonanywhere.com`.

## 7. Explicitement laissé de côté pour l'instant

- **IA / MCP** pour générer des questions automatiquement — pas activé,
  peut être ajouté plus tard sans casser l'existant (le point d'entrée
  naturel serait une nouvelle route qui appelle un modèle et propose des
  questions à valider dans l'espace admin avant publication).
- **Comptes utilisateurs** pour les candidats — les scores restent sur
  l'appareil de chacun, comme dans le prototype.
- **Build de production Tailwind** — l'app charge Tailwind depuis son
  CDN (rapide à mettre en place, aucune étape de compilation), ce que
  Tailwind déconseille pour un trafic important. Si le site devient très
  fréquenté, la suite logique est de compiler une feuille de style
  minifiée avec `Tailwind CLI` (nécessite Node.js).

## 8. Résumé pour une présentation orale

> "On est parti d'une maquette qui tournait entièrement dans le
> navigateur, sans aucune protection : n'importe qui pouvait modifier les
> questions, et ces modifications ne concernaient que son propre
> ordinateur. On a ajouté un vrai serveur avec une base de données
> partagée, un mot de passe pour l'administration, et corrigé une faille
> de sécurité qui aurait permis d'injecter du code malveillant dans les
> questions. Le nom de l'application, l'email de contact et l'identité
> légale sont centralisés dans un seul fichier pour être faciles à
> personnaliser. L'application est prête à être mise en ligne gratuitement
> sur PythonAnywhere."
