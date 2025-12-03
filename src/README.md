# PerfectPost - Extension Chrome (Version Source)

Cette version contient le code source lisible et éditable de l'extension PerfectPost.

## 📁 Structure du projet

```
src/
├── _locales/           # Fichiers de traduction (i18n)
│   ├── en/
│   │   └── messages.json
│   ├── fr/
│   │   └── messages.json
│   └── es/
│       └── messages.json
├── background/         # Service Worker (logique en arrière-plan)
│   └── background.js
├── content/            # Scripts injectés sur LinkedIn
│   ├── linkedin.js
│   └── linkedin.css
├── popup/              # Interface du popup
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── common/             # Utilitaires partagés
│   └── utils.js
├── images/             # Icônes de l'extension
│   ├── pp_icon16.png
│   ├── pp_icon32.png
│   ├── pp_icon48.png
│   ├── pp_icon128.png
│   ├── pp_icon256.png
│   └── pp_icon512.png
├── manifest.json       # Configuration de l'extension
└── README.md           # Ce fichier
```

## 🚀 Installation en mode développeur

### Chrome / Edge / Brave

1. Ouvrez votre navigateur
2. Allez dans `chrome://extensions/` (ou `edge://extensions/` pour Edge)
3. Activez le **Mode développeur** (en haut à droite)
4. Cliquez sur **Charger l'extension non empaquetée**
5. Sélectionnez le dossier `src/`
6. L'extension est maintenant installée !

### Firefox

1. Ouvrez Firefox
2. Allez dans `about:debugging#/runtime/this-firefox`
3. Cliquez sur **Charger un module temporaire**
4. Sélectionnez le fichier `manifest.json` dans le dossier `src/`

## 🛠️ Développement

### Fichiers principaux à modifier

| Fichier | Description |
|---------|-------------|
| `popup/popup.js` | Logique de l'interface popup |
| `popup/popup.css` | Styles du popup |
| `background/background.js` | Logique métier (API, storage, etc.) |
| `content/linkedin.js` | Fonctionnalités sur LinkedIn |
| `content/linkedin.css` | Styles injectés sur LinkedIn |

### Rechargement automatique

Après avoir modifié un fichier :
1. Allez dans `chrome://extensions/`
2. Cliquez sur l'icône de rechargement 🔄 de l'extension
3. Rafraîchissez la page LinkedIn si vous avez modifié le content script

### Débogage

- **Popup** : Clic droit sur l'icône de l'extension → "Inspecter la popup"
- **Background** : Dans `chrome://extensions/`, cliquez sur "Service Worker"
- **Content Script** : Ouvrez les DevTools sur LinkedIn (F12)

## 📝 Configuration

### API URL

L'URL de l'API PerfectPost est configurée dans `background/background.js` :

```javascript
const CONFIG = {
  API_URL: 'https://api.perfectpost.fr',
  APP_URL: 'https://app.perfectpost.fr',
};
```

### Traductions

Les traductions sont dans `_locales/{lang}/messages.json`.

Pour ajouter une nouvelle chaîne :
1. Ajoutez-la dans chaque fichier de langue
2. Utilisez `chrome.i18n.getMessage('key')` dans le code

## 🔧 Fonctionnalités

### Popup
- Connexion/Déconnexion au compte PerfectPost
- Affichage du statut LinkedIn
- Liens rapides vers le tableau de bord

### Content Script (LinkedIn)
- Bouton "Voir moins" sur les posts longs
- Bouton "Ajouter à ma liste" sur les profils
- Modal de sélection de liste

### Background
- Gestion de l'authentification
- Communication avec l'API PerfectPost
- Stockage local des données
- Gestion des alarmes (ping périodique)

## 📦 Build pour production

Pour créer une version de production :

1. Copiez le dossier `src/` vers un nouveau dossier
2. (Optionnel) Minifiez les fichiers JS/CSS
3. Créez un fichier ZIP du dossier
4. Soumettez sur le Chrome Web Store

## 🐛 Problèmes connus

- Les modifications du `manifest.json` nécessitent un rechargement complet de l'extension
- Le Service Worker peut se mettre en veille après 30 secondes d'inactivité

## 📄 Licence

Propriétaire - PerfectPost © 2024

## 🤝 Support

- Site web : https://perfectpost.fr
- Email : support@perfectpost.fr

