let maListe = [];
let filtreActif = 'all';
let donneesRecuperees = null; // stocke ce que Claude a extrait

/* ============================================================
   THÈME
   ============================================================ */
const html        = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');

const savedTheme = localStorage.getItem('fleam-theme') || 'dark';
appliquerTheme(savedTheme);

themeToggle.addEventListener('click', () => {
    appliquerTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

function appliquerTheme(theme) {
    html.setAttribute('data-theme', theme);
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('fleam-theme', theme);
}

/* ============================================================
   FETCH AUTO VIA CLAUDE API
   ============================================================ */
const fetchBtn    = document.getElementById('fetchBtn');
const fetchStatus = document.getElementById('fetchStatus');
const previewBox  = document.getElementById('previewBox');
const manualFields = document.getElementById('manualFields');
const submitBtn   = document.getElementById('submitBtn');

fetchBtn.addEventListener('click', async () => {
    const url = document.getElementById('site').value.trim();
    if (!url) {
        afficherStatus('error', '⚠ Colle d\'abord un lien produit.');
        return;
    }
    try { new URL(url); } catch {
        afficherStatus('error', '⚠ Lien invalide. Ex: https://www.nike.com/...');
        return;
    }

    // UI loading
    fetchBtn.disabled = true;
    document.getElementById('fetchBtnLabel').textContent = '...';
    afficherStatus('loading', '<span class="spinner">⟳</span> Analyse du produit en cours…');
    cacherPreview();

    try {
        const infos = await extraireInfosProduit(url);
        donneesRecuperees = infos;
        afficherPreview(infos);
        remplirChamps(infos);
        afficherStatus('success', '✓ Informations récupérées — vérifie et ajoute à ta liste !');
        manualFields.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
    } catch (err) {
        afficherStatus('error', '⚠ Impossible de récupérer les infos. Remplis manuellement.');
        manualFields.classList.remove('hidden');
        submitBtn.classList.remove('hidden');
        donneesRecuperees = { imageUrl: null };
    } finally {
        fetchBtn.disabled = false;
        document.getElementById('fetchBtnLabel').textContent = '⚡ AUTO';
    }
});

async function extraireInfosProduit(url) {
    const prompt = `Tu es un assistant qui extrait les informations d'un produit à partir de son URL.

URL du produit : ${url}

Utilise le web_search ou tes connaissances pour identifier ce produit.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après :
{
  "nom": "Nom exact du produit",
  "prix": 99.99,
  "description": "Courte description (1-2 phrases max)",
  "imageUrl": "URL directe de l'image principale du produit ou null",
  "marque": "Nom de la marque"
}

- prix doit être un nombre (ex: 109.99), sans symbole €
- Si tu ne trouves pas le prix exact, mets null
- imageUrl doit être une URL d'image directe (.jpg, .png, .webp) ou null
- Ne mets jamais de texte en dehors du JSON`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    const data = await response.json();

    // Extraire le texte de la réponse
    const textBlock = data.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('Pas de réponse texte');

    // Nettoyer et parser le JSON
    let raw = textBlock.text.trim();
    // Retirer éventuels backticks markdown
    raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Extraire le premier objet JSON trouvé
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON introuvable');

    return JSON.parse(match[0]);
}

function afficherPreview(infos) {
    const img = document.getElementById('previewImg');
    const placeholder = document.getElementById('previewImgPlaceholder');

    if (infos.imageUrl) {
        img.src = infos.imageUrl;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
        img.onerror = () => { img.classList.add('hidden'); placeholder.classList.remove('hidden'); };
    } else {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    document.getElementById('previewNom').textContent  = infos.nom || '—';
    document.getElementById('previewPrix').textContent = infos.prix != null ? infos.prix.toFixed(2) + ' €' : '—';
    document.getElementById('previewDesc').textContent = infos.description || '';
    previewBox.classList.remove('hidden');
}

function cacherPreview() {
    previewBox.classList.add('hidden');
    manualFields.classList.add('hidden');
    submitBtn.classList.add('hidden');
}

function remplirChamps(infos) {
    if (infos.nom)         document.getElementById('nom').value         = infos.nom;
    if (infos.prix != null) document.getElementById('prix').value       = infos.prix;
    if (infos.description) document.getElementById('description').value = infos.description;
}

function afficherStatus(type, msg) {
    fetchStatus.className = `fetch-status ${type}`;
    fetchStatus.innerHTML = msg;
    fetchStatus.classList.remove('hidden');
}

/* ============================================================
   FORMULAIRE — SOUMISSION
   ============================================================ */
document.getElementById('itemForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const nomInput  = document.getElementById('nom');
    const prixInput = document.getElementById('prix');
    const siteInput = document.getElementById('site');

    if (!nomInput.value.trim()) { secouerChamp(nomInput); return; }
    if (!siteInput.value.trim()) { secouerChamp(siteInput); return; }

    // Récupérer l'image : soit URL distante, soit null
    const imageUrl = donneesRecuperees?.imageUrl || null;

    // Si imageUrl distante, on la convertit en base64 pour l'affichage local
    let imageBase64 = null;
    if (imageUrl) {
        try {
            imageBase64 = await urlVersBase64(imageUrl);
        } catch {
            imageBase64 = null; // on continue sans image si ça échoue
        }
    }

    maListe.unshift({
        id:          Date.now(),
        nom:         nomInput.value.trim(),
        prix:        parseFloat(prixInput.value) || 0,
        date:        document.getElementById('date').value,
        site:        siteInput.value.trim(),
        description: document.getElementById('description').value.trim(),
        image:       imageBase64,
        imageUrl:    imageUrl,
        achete:      false
    });

    // Reset
    this.reset();
    cacherPreview();
    fetchStatus.classList.add('hidden');
    donneesRecuperees = null;
    mettreAJourStats();
    afficherListe();
});

async function urlVersBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function secouerChamp(input) {
    input.style.borderColor = '#e8001d';
    input.style.boxShadow   = '0 0 0 2px rgba(232,0,29,0.2)';
    input.focus();
    setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 1600);
}

/* ============================================================
   FILTRES
   ============================================================ */
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        filtreActif = this.dataset.filter;
        afficherListe();
    });
});

/* ============================================================
   AFFICHAGE LISTE
   ============================================================ */
function afficherListe() {
    const conteneur = document.getElementById('itemsContainer');
    conteneur.innerHTML = '';

    let liste = maListe;
    if (filtreActif === 'pending') liste = maListe.filter(a => !a.achete);
    if (filtreActif === 'bought')  liste = maListe.filter(a => a.achete);

    document.getElementById('listCount').textContent = liste.length;

    if (liste.length === 0) {
        const msgs = {
            all:     { icon: '🛍', text: 'Ta liste est vide — commence à shopper !' },
            pending: { icon: '📋', text: 'Aucun article en attente.' },
            bought:  { icon: '✓',  text: 'Aucun article acheté pour l\'instant.' }
        };
        const m = msgs[filtreActif];
        conteneur.innerHTML = `<div class="empty-state"><span class="empty-icon">${m.icon}</span><p>${m.text}</p></div>`;
        return;
    }

    liste.forEach(a => {
        const carte = document.createElement('div');
        carte.className = 'item-card' + (a.achete ? ' bought' : '');
        carte.dataset.id = a.id;

        // Image : base64 stockée ou URL distante directement
        const imgSrc = a.image || a.imageUrl;
        const imgHtml = imgSrc
            ? `<img src="${imgSrc}" alt="${esc(a.nom)}" onerror="this.parentElement.innerHTML='<div class=\\'card-image-placeholder\\'><span>👕</span><span>No image</span></div>'">`
            : `<div class="card-image-placeholder"><span>👕</span><span>No image</span></div>`;

        let metaHtml = '';
        if (a.date) metaHtml += `<div class="meta-chip"><span class="chip-icon">📅</span>${fmtDate(a.date)}</div>`;
        if (a.site) metaHtml += `<div class="meta-chip"><span class="chip-icon">🔗</span>${esc(nomSite(a.site))}</div>`;

        const lienHtml = a.site
            ? `<a href="${esc(a.site)}" target="_blank" rel="noopener" class="card-link">VOIR SUR LE SITE →</a>`
            : '';

        carte.innerHTML = `
            <div class="card-image">${imgHtml}</div>
            <div class="card-body">
                <div class="card-top">
                    <div class="card-nom">${esc(a.nom)}</div>
                    <div class="card-prix">${a.prix > 0 ? a.prix.toFixed(2) + ' €' : '—'}</div>
                </div>
                ${a.description ? `<div class="card-description">${esc(a.description)}</div>` : ''}
                ${metaHtml ? `<div class="card-meta">${metaHtml}</div>` : ''}
                ${lienHtml}
                <div class="card-actions">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" onchange="changerEtat(${a.id})" ${a.achete ? 'checked' : ''}>
                        <span class="checkbox-label">${a.achete ? 'ACHETÉ ✓' : 'MARQUER ACHETÉ'}</span>
                    </label>
                    <button class="btn-delete" onclick="supprimer(${a.id})">✕ SUPPRIMER</button>
                </div>
            </div>`;

        conteneur.appendChild(carte);
    });
}

/* ============================================================
   ACTIONS
   ============================================================ */
function changerEtat(id) {
    const a = maListe.find(x => x.id === id);
    if (a) { a.achete = !a.achete; mettreAJourStats(); afficherListe(); }
}

function supprimer(id) {
    const carte = document.querySelector(`.item-card[data-id="${id}"]`);
    if (carte) {
        carte.style.transition = 'opacity 0.2s, transform 0.2s';
        carte.style.opacity    = '0';
        carte.style.transform  = 'translateX(16px)';
        setTimeout(() => {
            maListe = maListe.filter(x => x.id !== id);
            mettreAJourStats();
            afficherListe();
        }, 220);
    }
}

function mettreAJourStats() {
    document.getElementById('counterTotal').textContent = maListe.length;
    document.getElementById('totalPrix').textContent    = maListe.reduce((s, a) => s + a.prix, 0).toFixed(2) + ' €';
}

/* ============================================================
   UTILS
   ============================================================ */
function esc(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
    if (!d) return '';
    const [y,m,j] = d.split('-');
    return `${j}/${m}/${y}`;
}
function nomSite(url) {
    try { return new URL(url).hostname.replace('www.',''); }
    catch { return url; }
}

/* ============================================================
   INIT
   ============================================================ */
mettreAJourStats();
afficherListe();