# Guide d'intégration - S-Post LinkedIn Manager

## Comment votre app S-PostBO peut récupérer les données LinkedIn

L'extension S-Post injecte automatiquement un script sur votre app qui expose les données LinkedIn.

---

## 🚀 Méthode 1 : Via `window.SPost` ou `window.LinkedInPlanner` (Recommandé)

### Vérifier si l'extension est installée

```javascript
// Dans votre app S-PostBO
if (window.SPost) {
  console.log('Extension S-Post détectée !');
} else {
  console.log('Extension S-Post non installée');
}
```

### Récupérer toutes les données LinkedIn

```javascript
// Async/await
const data = await window.SPost.getData();
console.log(data);

// Résultat:
// {
//   connected: true,
//   csrf: "ajax:123456789...",
//   profile: {
//     firstName: "Jean",
//     lastName: "Dupont",
//     publicIdentifier: "jean-dupont",
//     headline: "CEO @ Company",
//     picture: "https://..."
//   },
//   me: {
//     plainId: 123456789,
//     premiumSubscriber: false
//   },
//   extractedAt: "2024-..."
// }
```

### Récupérer juste le profil

```javascript
const profile = await window.SPost.getProfile();
console.log(profile.firstName, profile.lastName);
```

### Vérifier si LinkedIn est connecté

```javascript
const isConnected = await window.SPost.isConnected();
if (isConnected) {
  // L'utilisateur est connecté à LinkedIn
}
```

### Récupérer le CSRF token

```javascript
const csrf = await window.SPost.getCsrf();
// Utilisez ce token pour les requêtes API LinkedIn
```

---

## 🚀 Méthode 2 : Via localStorage

L'extension synchronise automatiquement les données dans `localStorage`.

```javascript
// Récupérer les données
const dataStr = localStorage.getItem('spost_linkedin_data');
const data = JSON.parse(dataStr);

console.log(data);
// {
//   connected: true,
//   csrf: "...",
//   profile: {...},
//   me: {...},
//   updatedAt: "2024-...",
//   extensionVersion: "1.0.0"
// }
```

---

## 🚀 Méthode 3 : Via événements

### Écouter quand l'extension est prête

```javascript
window.addEventListener('SPostReady', (event) => {
  console.log('Extension S-Post prête !', event.detail);
  // Maintenant vous pouvez utiliser window.SPost
});
```

### Écouter les mises à jour de données

```javascript
window.addEventListener('SPostDataUpdated', (event) => {
  console.log('Nouvelles données LinkedIn:', event.detail);
  // Mettre à jour votre UI
});
```

---

## 🚀 Méthode 4 : Via postMessage

Envoyez des messages à l'extension et recevez des réponses.

```javascript
// Demander les données
window.postMessage({ type: 'SPOST_GET_DATA' }, '*');

// Écouter la réponse
window.addEventListener('message', (event) => {
  if (event.data.type === 'SPOST_GET_DATA_RESPONSE') {
    const data = event.data.payload;
    console.log('Données reçues:', data);
  }
});
```

### Messages disponibles

| Message | Description |
|---------|-------------|
| `SPOST_GET_DATA` | Récupérer toutes les données |
| `SPOST_GET_LISTS` | Récupérer les listes |
| `SPOST_CREATE_LIST` | Créer une liste (payload: `{name: "..."}`) |
| `SPOST_GET_DRAFTS` | Récupérer les brouillons |
| `SPOST_SAVE_DRAFT` | Sauvegarder un brouillon |
| `SPOST_DELETE_DRAFT` | Supprimer un brouillon (payload: `{id: "..."}`) |

---

## 📋 Gestion des listes

### Récupérer les listes

```javascript
const lists = await window.SPost.getLists();
// [{_id: "...", name: "Ma liste", members: [...], organizations: [...]}]
```

### Créer une liste

```javascript
const newList = await window.SPost.createList("Prospects");
console.log(newList._id);
```

---

## 📝 Gestion des brouillons

### Récupérer les brouillons

```javascript
const drafts = await window.SPost.getDrafts();
```

### Sauvegarder un brouillon

```javascript
const draft = await window.SPost.saveDraft({
  content: "Mon post LinkedIn...",
  scheduledAt: "2024-12-15T10:00:00Z",
});
```

### Supprimer un brouillon

```javascript
await window.SPost.deleteDraft("draft_id");
```

---

## 🔧 Exemple complet pour S-PostBO (React)

```javascript
// Utiliser le hook useLinkedIn
import { useLinkedIn } from '@/hooks/useLinkedIn';

function MonComposant() {
  const { 
    isExtensionInstalled,
    isConnected, 
    isLoading, 
    profile, 
    refresh,
    getLists,
    getDrafts 
  } = useLinkedIn();
  
  if (isLoading) return <div>Chargement...</div>;
  
  if (!isExtensionInstalled) {
    return <div>Veuillez installer l'extension S-Post</div>;
  }
  
  if (!isConnected) {
    return <div>Connectez-vous à LinkedIn</div>;
  }
  
  return (
    <div>
      <h2>Bienvenue {profile?.firstName} {profile?.lastName}</h2>
      <p>{profile?.headline}</p>
      <button onClick={refresh}>Rafraîchir</button>
    </div>
  );
}
```

---

## ⚠️ Notes importantes

1. **L'extension doit être installée** - Vérifiez avec `window.SPost`
2. **L'utilisateur doit être connecté à LinkedIn** - Vérifiez avec `isConnected()`
3. **Les données sont mises à jour automatiquement** toutes les 30 secondes
4. **Le CSRF token expire** - Récupérez-le à chaque requête importante

---

## 🔄 Migration depuis PerfectPost

Si vous utilisiez PerfectPost auparavant, voici les équivalences :

| PerfectPost | S-Post |
|-------------|--------|
| `window.LinkedInPlanner` | `window.SPost` (legacy: `window.LinkedInPlanner`) |
| `LinkedInPlannerReady` | `SPostReady` |
| `LinkedInPlannerDataUpdated` | `SPostDataUpdated` |
| `linkedin_planner_data` | `spost_linkedin_data` |

Les anciennes API sont toujours disponibles pour la rétrocompatibilité.
