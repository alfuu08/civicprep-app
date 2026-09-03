/*
 * Logique du quiz et de l'examen blanc.
 *
 * `questionsDatabase`, `EXAM_QUESTION_COUNT` et `EXAM_PASS_SCORE` sont
 * injectés par le serveur juste avant ce fichier (voir templates/index.html).
 *
 * Point de sécurité important n°1 : le texte des questions/options vient de
 * la base de données (donc, in fine, d'un formulaire rempli par l'admin). On
 * ne fait jamais confiance à ce texte lors de l'insertion dans le DOM : toute
 * valeur passée dans un gabarit HTML (innerHTML) passe par escapeHtml()
 * pour empêcher qu'un bout de HTML/JS injecté ne s'exécute chez les
 * visiteurs (faille XSS stockée).
 *
 * Point de sécurité important n°2 : aucun attribut onclick="..." n'est
 * utilisé dans le HTML. Notre politique de sécurité (CSP, voir app.py)
 * bloque volontairement ces gestionnaires d'événements "en ligne", car ils
 * sont un vecteur classique d'injection de code. À la place, chaque élément
 * cliquable porte un attribut data-action (et parfois data-arg), et UNE
 * seule fonction ci-dessous écoute tous les clics de la page et distribue
 * vers la bonne action ("délégation d'événements").
 */

function escapeHtml(texte) {
    const div = document.createElement('div');
    div.textContent = String(texte);
    return div.innerHTML;
}

// --- Distribution centralisée des clics (compatible avec la CSP) -----------

const ACTIONS = {
    'switch-tab': (arg) => switchTab(arg),
    'open-share-modal': () => openShareModal(),
    'close-share-modal': () => closeShareModal(),
    'copy-share-link': () => copyShareLink(),
    'accept-cookies': () => acceptCookies(),
    'close-theme-quiz': () => closeThemeQuiz(),
    'start-theme-quiz': (arg) => startThemeQuiz(arg),
    'answer-theme-question': (arg) => {
        const [selected, correct] = arg.split(',').map(Number);
        answerThemeQuestion(selected, correct);
    },
    'start-exam': () => startExam(),
    'prev-exam-question': () => prevExamQuestion(),
    'next-exam-question': () => nextExamQuestion(),
    'submit-exam': () => submitExam(),
};

document.addEventListener('click', (event) => {
    const cible = event.target.closest('[data-action]');
    if (!cible) return;
    const gestionnaire = ACTIONS[cible.dataset.action];
    if (!gestionnaire) return;
    event.preventDefault();
    gestionnaire(cible.dataset.arg);
});

document.addEventListener('change', (event) => {
    if (event.target.matches('input[name="exam-opt"]')) {
        selectExamAnswer(Number(event.target.value));
    }
});

// --- Bandeau cookies RGPD ---------------------------------------------------

window.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('cookie_consent')) {
        document.getElementById('cookie-banner').classList.remove('hidden');
        document.getElementById('cookie-banner').classList.add('flex');
    }
});

function acceptCookies() {
    localStorage.setItem('cookie_consent', 'true');
    const banner = document.getElementById('cookie-banner');
    banner.classList.add('hidden');
    banner.classList.remove('flex');
}

// --- Notifications discrètes (remplace les alert() natifs) -----------------

function notifier(message, type = 'info') {
    const couleurs = {
        success: 'bg-emerald-600',
        danger: 'bg-rose-600',
        info: 'bg-slate-800',
    };
    const toast = document.createElement('div');
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[100] ${couleurs[type]} text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg animate-fade`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// --- Navigation entre onglets ------------------------------------------------

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tabId).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        const actif = btn.dataset.target === tabId;
        btn.classList.toggle('text-france-blue', actif);
        btn.classList.toggle('bg-blue-50', actif);
        btn.classList.toggle('text-slate-600', !actif);
    });

    document.querySelectorAll('.mobile-btn').forEach(btn => {
        const actif = btn.dataset.target === tabId;
        btn.classList.toggle('text-france-blue', actif);
        btn.classList.toggle('text-slate-500', !actif);
    });

    if (tabId === 'themes') renderThemes();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Révision par thème -------------------------------------------------------

function renderThemes() {
    const container = document.getElementById('themes-grid');
    const themesList = [...new Set(questionsDatabase.map(q => q.theme))];

    container.innerHTML = themesList.map(theme => `
        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
            <div>
                <div class="w-10 h-10 rounded-xl bg-blue-50 text-france-blue flex items-center justify-center font-bold mb-3">
                    <i class="fa-solid fa-bookmark" aria-hidden="true"></i>
                </div>
                <h3 class="font-bold text-lg text-slate-900">${escapeHtml(theme)}</h3>
                <p class="text-xs text-slate-500 mt-1">${questionsDatabase.filter(q => q.theme === theme).length} questions disponibles</p>
            </div>
            <button data-action="start-theme-quiz" data-arg="${escapeHtml(theme)}" class="bg-slate-100 hover:bg-france-blue hover:text-white text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm transition flex items-center justify-between">
                <span>Commencer la révision</span>
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
        </div>
    `).join('');
}

let activeThemeQuestions = [];
let activeThemeIndex = 0;
let activeThemeScore = 0;

function startThemeQuiz(theme) {
    activeThemeQuestions = questionsDatabase.filter(q => q.theme === theme);
    activeThemeIndex = 0;
    activeThemeScore = 0;
    document.getElementById('themes-grid').classList.add('hidden');
    document.getElementById('theme-quiz-container').classList.remove('hidden');
    document.getElementById('current-theme-title').innerText = "Thème : " + theme;
    renderThemeQuestion();
}

function renderThemeQuestion() {
    const box = document.getElementById('theme-question-box');
    if (activeThemeIndex >= activeThemeQuestions.length) {
        box.innerHTML = `
            <div class="text-center py-8 space-y-4">
                <div class="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full mx-auto flex items-center justify-center text-2xl">
                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                </div>
                <h4 class="text-xl font-bold text-slate-900">Révision terminée !</h4>
                <p class="text-sm text-slate-600">Score obtenu : ${activeThemeScore} / ${activeThemeQuestions.length}</p>
                <button data-action="close-theme-quiz" class="bg-france-blue text-white px-6 py-2.5 rounded-xl font-semibold text-sm">Retour aux thèmes</button>
            </div>
        `;
        return;
    }
    const q = activeThemeQuestions[activeThemeIndex];
    box.innerHTML = `
        <div class="space-y-4">
            <span class="text-xs font-semibold text-france-blue bg-blue-50 px-3 py-1 rounded-full">Question ${activeThemeIndex + 1}/${activeThemeQuestions.length}</span>
            <h4 class="font-bold text-base text-slate-900">${escapeHtml(q.q)}</h4>
            <div class="space-y-2">
                ${q.options.map((opt, idx) => `
                    <button data-action="answer-theme-question" data-arg="${idx},${q.answer}" class="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-france-blue text-sm transition font-medium text-slate-700 option-btn">
                        ${escapeHtml(opt)}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function answerThemeQuestion(selected, correct) {
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === correct) btn.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700');
        if (idx === selected && selected !== correct) btn.classList.add('bg-rose-50', 'border-rose-500', 'text-rose-700');
    });
    if (selected === correct) activeThemeScore++;
    setTimeout(() => {
        activeThemeIndex++;
        renderThemeQuestion();
    }, 1200);
}

function closeThemeQuiz() {
    document.getElementById('theme-quiz-container').classList.add('hidden');
    document.getElementById('themes-grid').classList.remove('hidden');
}

// --- Examen blanc --------------------------------------------------------------

function getExamQuestions() {
    // S'il y a moins de questions que EXAM_QUESTION_COUNT dans la base, on
    // complète en réutilisant des questions existantes (marquées comme cas
    // pratiques). Plus la base grandit via l'admin, moins ce complément
    // artificiel est nécessaire.
    let pool = [...questionsDatabase];
    while (pool.length < EXAM_QUESTION_COUNT && questionsDatabase.length > 0) {
        const randomQ = questionsDatabase[Math.floor(Math.random() * questionsDatabase.length)];
        pool.push({ ...randomQ, q: randomQ.q + " (Cas pratique n°" + (pool.length + 1) + ")" });
    }
    return pool.slice(0, EXAM_QUESTION_COUNT);
}

let examQuestions = [];
let currentExamIndex = 0;
let userAnswers = {};

function startExam() {
    examQuestions = getExamQuestions();
    currentExamIndex = 0;
    userAnswers = {};
    document.getElementById('exam-intro').classList.add('hidden');
    document.getElementById('exam-result').classList.add('hidden');
    document.getElementById('exam-active').classList.remove('hidden');
    renderExamQuestion();
}

function renderExamQuestion() {
    const q = examQuestions[currentExamIndex];
    document.getElementById('exam-progress').innerText = `Question ${currentExamIndex + 1} sur ${examQuestions.length}`;

    const progressPct = Math.round(((currentExamIndex + 1) / examQuestions.length) * 100);
    const bar = document.getElementById('exam-progress-bar');
    bar.style.width = progressPct + '%';
    document.getElementById('exam-progress-bar-track').setAttribute('aria-valuenow', progressPct);

    const contentBox = document.getElementById('exam-question-content');
    contentBox.innerHTML = `
        <div class="space-y-4">
            <h3 class="font-bold text-lg text-slate-900">${escapeHtml(q.q)}</h3>
            <div class="space-y-3">
                ${q.options.map((opt, idx) => `
                    <label class="flex items-center space-x-3 p-4 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer transition ${userAnswers[currentExamIndex] === idx ? 'bg-blue-50 border-france-blue ring-1 ring-france-blue' : ''}">
                        <input type="radio" name="exam-opt" value="${idx}" ${userAnswers[currentExamIndex] === idx ? 'checked' : ''} class="w-4 h-4 text-france-blue">
                        <span class="text-sm font-medium text-slate-700">${escapeHtml(opt)}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    document.getElementById('prev-btn').disabled = currentExamIndex === 0;
    const nextBtn = document.getElementById('next-btn');
    if (currentExamIndex === examQuestions.length - 1) {
        nextBtn.innerText = "Terminer et corriger";
        nextBtn.dataset.action = 'submit-exam';
    } else {
        nextBtn.innerText = "Suivant";
        nextBtn.dataset.action = 'next-exam-question';
    }
}

function selectExamAnswer(idx) {
    userAnswers[currentExamIndex] = idx;
    renderExamQuestion();
}

function nextExamQuestion() {
    if (currentExamIndex < examQuestions.length - 1) {
        currentExamIndex++;
        renderExamQuestion();
    }
}

function prevExamQuestion() {
    if (currentExamIndex > 0) {
        currentExamIndex--;
        renderExamQuestion();
    }
}

function submitExam() {
    let score = 0;
    const weakThemes = {};

    examQuestions.forEach((q, idx) => {
        if (userAnswers[idx] === q.answer) {
            score++;
        } else {
            weakThemes[q.theme] = (weakThemes[q.theme] || 0) + 1;
        }
    });

    document.getElementById('exam-active').classList.add('hidden');
    const resultBox = document.getElementById('exam-result');
    resultBox.classList.remove('hidden');

    const passed = score >= EXAM_PASS_SCORE;
    const bilan = Object.keys(weakThemes).length === 0
        ? 'Parfait ! Aucune erreur majeure constatée sur cet examen.'
        : 'Thématiques nécessitant un renforcement : ' + Object.keys(weakThemes).map(escapeHtml).join(', ') + '.';

    resultBox.innerHTML = `
        <div class="text-center space-y-4">
            <div class="w-20 h-20 rounded-3xl mx-auto flex items-center justify-center text-3xl ${passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}">
                <i class="fa-solid ${passed ? 'fa-trophy' : 'fa-triangle-exclamation'}" aria-hidden="true"></i>
            </div>
            <div class="space-y-1">
                <h3 class="text-2xl font-bold text-slate-900">Résultat de l'Examen Blanc</h3>
                <p class="text-3xl font-extrabold ${passed ? 'text-emerald-600' : 'text-rose-600'}">${score} / ${examQuestions.length}</p>
                <p class="text-sm font-medium ${passed ? 'text-emerald-700' : 'text-rose-700'}">
                    ${passed ? `Félicitations ! Vous avez réussi l'examen blanc (seuil requis : ${EXAM_PASS_SCORE}/${examQuestions.length}).` : `Attention, le score minimum requis est de ${EXAM_PASS_SCORE}/${examQuestions.length}. Continuez vos révisions !`}
                </p>
            </div>
            <div class="bg-slate-50 p-6 rounded-2xl text-left space-y-3 border border-slate-100">
                <h4 class="font-bold text-slate-900 text-sm"><i class="fa-solid fa-chart-pie mr-2 text-france-blue" aria-hidden="true"></i> Bilan personnalisé & Points d'amélioration</h4>
                <p class="text-xs text-slate-600 leading-relaxed">${bilan}</p>
            </div>
            <button data-action="start-exam" class="bg-france-blue text-white px-8 py-3 rounded-xl font-semibold text-sm shadow-md hover:bg-blue-800 transition">
                Recommencer un examen blanc
            </button>
        </div>
    `;
}

// --- Partage (lien + QR code) ----------------------------------------------

function openShareModal() {
    const currentUrl = window.location.href;
    document.getElementById('share-url').value = currentUrl;
    document.getElementById('qrcode-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(currentUrl)}`;
    document.getElementById('share-modal').classList.remove('hidden');
}

function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
}

function copyShareLink() {
    const input = document.getElementById('share-url');
    input.select();
    navigator.clipboard.writeText(input.value);
    notifier('Lien copié dans le presse-papier !', 'success');
}
