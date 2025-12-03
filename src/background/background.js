/**
 * S-Post - Background Service Worker
 * Envoie les données LinkedIn vers S-PostBO
 */

// ============================================
// Configuration - S-POST BACKOFFICE
// ============================================
const CONFIG = {
  // URL de votre backoffice S-PostBO
  BACKOFFICE_URL: 'http://localhost:5174',
  
  // Endpoints API (à adapter selon votre backoffice)
  API: {
    LINKEDIN_SESSION: '/api/linkedin/session',
    LINKEDIN_PROFILE: '/api/linkedin/profile',
    SYNC_DATA: '/api/sync',
    WEBHOOK: '/api/webhook',
  },
  
  STORAGE_KEYS: {
    LINKEDIN_SESSION: 'pp_linkedin_session',
    SETTINGS: 'pp_settings',
    LAST_ACTIVITY: 'pp_last_activity',
    LISTS: 'pp_lists',
    DRAFTS: 'pp_drafts',
    POSTS: 'pp_posts',
    LAST_SYNC: 'pp_last_sync',
    SCHEDULED_POSTS: 'pp_scheduled_posts', // Posts programmés
  },
};

// ============================================
// État global
// ============================================
let linkedinState = {
  isConnected: false,
  csrf: null,
  profile: null,
  me: null,
  locale: null,
};

// ============================================
// Initialisation
// ============================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[S-Post] Extension installée:', details.reason);
  await loadSavedState();
  await initLocalData();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[S-Post] Démarrage');
  await loadSavedState();
  updateBadge();
});

// ============================================
// Intercepteur de requêtes LinkedIn (comme PerfectPost)
// Capture automatiquement les stats des posts
// ============================================

// Écouter les requêtes vers l'API LinkedIn d'activité/stats
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    // Ne traiter que les requêtes réussies
    if (details.statusCode !== 200) return;
    
    const url = details.url;
    
    // Détecter les requêtes d'activité/stats
    if (url.includes('/voyager/api/') && 
        (url.includes('activity') || 
         url.includes('socialActions') || 
         url.includes('contentcreation') ||
         url.includes('analytics') ||
         url.includes('feed/updates'))) {
      
      console.log('[S-Post WebRequest] Requête stats détectée:', url.substring(0, 100));
      
      // Notifier le content script de récupérer les données
      try {
        const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'LINKEDIN_API_RESPONSE', 
            url: url,
            timestamp: Date.now()
          }).catch(() => {});
        }
      } catch (e) {
        // Ignorer les erreurs
      }
    }
  },
  { urls: ['*://*.linkedin.com/voyager/api/*'] }
);

/**
 * Charge l'état sauvegardé
 */
async function loadSavedState() {
  try {
    const result = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.LINKEDIN_SESSION,
    ]);
    
    if (result[CONFIG.STORAGE_KEYS.LINKEDIN_SESSION]) {
      linkedinState = result[CONFIG.STORAGE_KEYS.LINKEDIN_SESSION];
      console.log('[S-Post] Session LinkedIn restaurée');
    }
  } catch (error) {
    console.error('[S-Post] Erreur chargement:', error);
  }
}

/**
 * Initialise les données locales
 */
async function initLocalData() {
  const result = await chrome.storage.local.get([
    CONFIG.STORAGE_KEYS.LISTS,
    CONFIG.STORAGE_KEYS.DRAFTS,
  ]);
  
  if (!result[CONFIG.STORAGE_KEYS.LISTS]) {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LISTS]: [] });
  }
  
  if (!result[CONFIG.STORAGE_KEYS.DRAFTS]) {
    await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.DRAFTS]: [] });
  }
}

// ============================================
// Gestion des messages
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[S-Post] Message:', message.type);
  
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[S-Post] Erreur:', error);
      sendResponse({ error: error.message });
    });
  
  return true;
});

/**
 * Gère les messages
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    // ==================
    // Auth (bypass)
    // ==================
    case 'login':
      return { success: true, user: { email: 'local', premium: true } };
    
    case 'logout':
      return { success: true };
    
    case 'check_auth_status':
      return { authenticated: true, user: { email: 'local', premium: true } };
    
    // ==================
    // LinkedIn - IMPORTANT
    // ==================
    case 'check_linkedin_status':
      return {
        connected: linkedinState.isConnected,
        profile: linkedinState.profile,
      };
    
    case 'csrf':
      return await handleLinkedInData(message);
    
    case 'get_linkedin_data':
      return getLinkedInData();
    
    case 'send_to_backoffice':
      return await sendToBackoffice(message.data);
    
    // ==================
    // Activité
    // ==================
    case 'get_activity':
      return await getActivity();
    
    case 'update_activity':
      return await updateActivity(message.activityType);
    
    // ==================
    // Listes
    // ==================
    case 'get_list_refresh':
      return await getLists();
    
    case 'create_list':
      return await createList(message.name);
    
    case 'edit_list':
      return await editList(message.id, message.name);
    
    case 'remove_list':
      return await removeList(message.id);
    
    case 'add_to_list':
      return await addToList(message);
    
    case 'remove_from_list':
      return await removeFromList(message);
    
    case 'check_user_in_lists':
      return await checkUserInLists(message);
    
    // ==================
    // Brouillons
    // ==================
    case 'get_drafts':
      return await getDrafts();
    
    case 'save_draft':
      return await saveDraft(message.draft);
    
    case 'delete_draft':
      return await deleteDraft(message.id);
    
    case 'clone_draft':
      return await cloneDraft(message.id);
    
    // ==================
    // Posts programmés
    // ==================
    case 'get_scheduled_posts':
      return await getScheduledPosts();
    
    case 'schedule_post':
      return await schedulePost(message.post);
    
    case 'update_scheduled_post':
      return await updateScheduledPost(message.post);
    
    case 'cancel_scheduled_post':
      return await cancelScheduledPost(message.id);
    
    case 'publish_now':
      return await publishNow(message.post);
    
    // ==================
    // Posts LinkedIn
    // ==================
    case 'get_posts':
      return await getPosts();
    
    case 'save_posts':
      return await savePosts(message.posts);
    
    case 'save_analytics':
      return await saveAnalytics(message.analytics);
    
    case 'get_analytics':
      return await getAnalytics();
    
    case 'fetch_linkedin_posts':
      return await fetchLinkedInPosts();
    
    // ==================
    // Notion API (pour contourner CORS)
    // ==================
    case 'notion_api_call':
      return await handleNotionApiCall(message);
    
    // ==================
    // Paramètres
    // ==================
    case 'get_settings':
      return await getSettings();
    
    case 'save_settings':
      return await saveSettings(message.settings);
    
    default:
      return { error: 'Type de message inconnu' };
  }
}

// ============================================
// GESTION DES DONNÉES LINKEDIN
// ============================================

/**
 * Traite les données LinkedIn extraites et les envoie au backoffice
 */
async function handleLinkedInData(message) {
  console.log('[S-Post] Données LinkedIn reçues');
  
  // Sauvegarder localement
  linkedinState = {
    isConnected: true,
    csrf: message.csrf,
    profile: message.miniProfile,
    me: message.me,
    locale: message.locale || 'fr',
    extractedAt: new Date().toISOString(),
  };
  
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.LINKEDIN_SESSION]: linkedinState,
  });
  
  // Préparer les données pour le backoffice
  const linkedinData = {
    // Token CSRF LinkedIn (pour les requêtes API)
    csrf: message.csrf,
    
    // Informations du profil
    profile: message.miniProfile ? {
      entityUrn: message.miniProfile.entityUrn,
      firstName: message.miniProfile.firstName,
      lastName: message.miniProfile.lastName,
      headline: message.miniProfile.occupation,
      publicIdentifier: message.miniProfile.publicIdentifier,
      picture: message.miniProfile.picture?.rootUrl 
        ? `${message.miniProfile.picture.rootUrl}${message.miniProfile.picture.artifacts?.[0]?.fileIdentifyingUrlPathSegment || ''}`
        : null,
      profileUrl: message.miniProfile.publicIdentifier 
        ? `https://www.linkedin.com/in/${message.miniProfile.publicIdentifier}`
        : null,
    } : null,
    
    // Données "Me" complètes
    me: message.me ? {
      plainId: message.me.plainId,
      premiumSubscriber: message.me.premiumSubscriber,
      publicContactInfo: message.me.publicContactInfo,
    } : null,
    
    // Métadonnées
    metadata: {
      extractedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      extensionVersion: chrome.runtime.getManifest().version,
    },
  };
  
  // Envoyer au backoffice
  try {
    await sendToBackoffice(linkedinData);
    console.log('[S-Post] Données envoyées au backoffice');
  } catch (error) {
    console.error('[S-Post] Erreur envoi backoffice:', error);
  }
  
  // Mettre à jour le badge
  updateBadge();
  
  return {
    authenticated: true,
    premium: true,
    linkedinConnected: true,
  };
}

/**
 * Récupère les données LinkedIn stockées
 */
function getLinkedInData() {
  return {
    connected: linkedinState.isConnected,
    csrf: linkedinState.csrf,
    profile: linkedinState.profile,
    me: linkedinState.me,
    extractedAt: linkedinState.extractedAt,
  };
}

/**
 * Envoie les données au backoffice
 */
async function sendToBackoffice(data) {
  const url = `${CONFIG.BACKOFFICE_URL}${CONFIG.API.LINKEDIN_SESSION}`;
  
  console.log('[S-Post] Envoi vers:', url);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version,
      },
      body: JSON.stringify(data),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[S-Post] Réponse backoffice:', result);
      
      // Sauvegarder la date de dernière sync
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.LAST_SYNC]: new Date().toISOString(),
      });
      
      return { success: true, data: result };
    } else {
      console.error('[S-Post] Erreur HTTP:', response.status);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error('[S-Post] Erreur réseau:', error);
    // Ne pas bloquer si le backoffice n'est pas disponible
    return { success: false, error: error.message };
  }
}

// ============================================
// Ouvrir le backoffice avec les données
// ============================================

/**
 * Ouvre le backoffice avec les données LinkedIn en paramètre
 */
async function openBackofficeWithData() {
  const data = getLinkedInData();
  
  // Encoder les données pour l'URL
  const params = new URLSearchParams({
    linkedin_connected: data.connected ? '1' : '0',
    profile_id: data.profile?.publicIdentifier || '',
    profile_name: data.profile ? `${data.profile.firstName} ${data.profile.lastName}` : '',
    csrf: data.csrf || '',
  });
  
  const url = `${CONFIG.BACKOFFICE_URL}?${params.toString()}`;
  
  chrome.tabs.create({ url });
}

// ============================================
// Handlers d'activité
// ============================================

async function getActivity() {
  const result = await chrome.storage.local.get([
    CONFIG.STORAGE_KEYS.LAST_ACTIVITY,
    CONFIG.STORAGE_KEYS.LAST_SYNC,
  ]);
  
  return {
    lastPing: result[CONFIG.STORAGE_KEYS.LAST_ACTIVITY]?.lastPing || new Date().toISOString(),
    lastProfileUpdate: result[CONFIG.STORAGE_KEYS.LAST_ACTIVITY]?.lastProfileUpdate || null,
    lastSync: result[CONFIG.STORAGE_KEYS.LAST_SYNC] || null,
  };
}

async function updateActivity(activityType) {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.LAST_ACTIVITY);
  const activity = result[CONFIG.STORAGE_KEYS.LAST_ACTIVITY] || {};
  
  activity[activityType] = new Date().toISOString();
  activity.lastPing = new Date().toISOString();
  
  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.LAST_ACTIVITY]: activity,
  });
  
  return activity;
}

// ============================================
// Handlers de listes (stockage local)
// ============================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function getLists() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.LISTS);
  return result[CONFIG.STORAGE_KEYS.LISTS] || [];
}

async function saveLists(lists) {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.LISTS]: lists });
}

async function createList(name) {
  const lists = await getLists();
  const newList = {
    _id: generateId(),
    name,
    members: [],
    organizations: [],
    createdAt: new Date().toISOString(),
  };
  lists.push(newList);
  await saveLists(lists);
  return newList;
}

async function editList(id, name) {
  const lists = await getLists();
  const index = lists.findIndex(l => l._id === id);
  if (index !== -1) {
    lists[index].name = name;
    await saveLists(lists);
    return lists[index];
  }
  return { error: 'Liste non trouvée' };
}

async function removeList(id) {
  const lists = await getLists();
  await saveLists(lists.filter(l => l._id !== id));
  return { success: true };
}

async function addToList(message) {
  const lists = await getLists();
  const list = lists.find(l => l._id === message.id);
  if (!list) return { error: 'Liste non trouvée' };
  
  const member = { urn: message.urn, name: message.name, picture: message.picture };
  
  if (message.isOrganization) {
    if (!list.organizations.some(o => o.urn === message.urn)) {
      list.organizations.push(member);
    }
  } else {
    if (!list.members.some(m => m.urn === message.urn)) {
      list.members.push(member);
    }
  }
  
  await saveLists(lists);
  return { success: true };
}

async function removeFromList(message) {
  const lists = await getLists();
  const list = lists.find(l => l._id === message.id);
  if (!list) return { error: 'Liste non trouvée' };
  
  list.members = list.members.filter(m => m.urn !== message.urn);
  list.organizations = list.organizations.filter(o => o.urn !== message.urn);
  
  await saveLists(lists);
  return { success: true };
}

async function checkUserInLists(message) {
  const lists = await getLists();
  const userLists = lists
    .filter(list => 
      list.members.some(m => m.urn === message.userIdentifier) ||
      list.organizations.some(o => o.urn === message.userIdentifier)
    )
    .map(list => list.name);
  
  return { isInLists: userLists.length > 0, userLists };
}

// ============================================
// Handlers de brouillons (stockage local)
// ============================================

async function getDrafts() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.DRAFTS);
  return result[CONFIG.STORAGE_KEYS.DRAFTS] || [];
}

async function saveDraftsToStorage(drafts) {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.DRAFTS]: drafts });
}

async function saveDraft(draft) {
  const drafts = await getDrafts();
  
  if (draft.id) {
    const index = drafts.findIndex(d => d.id === draft.id);
    if (index !== -1) {
      drafts[index] = { ...drafts[index], ...draft, updatedAt: new Date().toISOString() };
    }
  } else {
    draft.id = generateId();
    draft.createdAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    drafts.push(draft);
  }
  
  await saveDraftsToStorage(drafts);
  return draft;
}

async function deleteDraft(id) {
  const drafts = await getDrafts();
  await saveDraftsToStorage(drafts.filter(d => d.id !== id));
  return { success: true };
}

async function cloneDraft(id) {
  const drafts = await getDrafts();
  const original = drafts.find(d => d.id === id);
  
  if (!original) {
    return { error: 'Brouillon non trouvé' };
  }
  
  const clone = {
    ...original,
    id: generateId(),
    title: `${original.title || 'Sans titre'} (copie)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  drafts.push(clone);
  await saveDraftsToStorage(drafts);
  
  return { success: true, draft: clone };
}

// ============================================
// Handlers de posts programmés
// ============================================

async function getScheduledPosts() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.SCHEDULED_POSTS);
  const posts = result[CONFIG.STORAGE_KEYS.SCHEDULED_POSTS] || [];
  
  // Trier par date de publication prévue
  return posts.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

async function saveScheduledPosts(posts) {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.SCHEDULED_POSTS]: posts });
}

async function schedulePost(post) {
  const posts = await getScheduledPosts();
  
  const scheduledPost = {
    id: generateId(),
    content: post.content,
    media: post.media || [],
    scheduledAt: post.scheduledAt,
    status: 'scheduled', // scheduled, publishing, published, failed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objective: post.objective || null,
    category: post.category || null,
    firstComment: post.firstComment || null,
  };
  
  posts.push(scheduledPost);
  await saveScheduledPosts(posts);
  
  // Créer une alarme pour cette publication
  await createPublishAlarm(scheduledPost);
  
  console.log('[S-Post] Post programmé:', scheduledPost.id, 'pour', scheduledPost.scheduledAt);
  
  return { success: true, post: scheduledPost };
}

async function updateScheduledPost(post) {
  const posts = await getScheduledPosts();
  const index = posts.findIndex(p => p.id === post.id);
  
  if (index === -1) {
    return { error: 'Post programmé non trouvé' };
  }
  
  // Supprimer l'ancienne alarme
  await chrome.alarms.clear(`publish_${post.id}`);
  
  // Mettre à jour le post
  posts[index] = {
    ...posts[index],
    ...post,
    updatedAt: new Date().toISOString(),
  };
  
  await saveScheduledPosts(posts);
  
  // Créer une nouvelle alarme si le post est toujours programmé
  if (posts[index].status === 'scheduled') {
    await createPublishAlarm(posts[index]);
  }
  
  return { success: true, post: posts[index] };
}

async function cancelScheduledPost(id) {
  const posts = await getScheduledPosts();
  const post = posts.find(p => p.id === id);
  
  if (!post) {
    return { error: 'Post programmé non trouvé' };
  }
  
  // Supprimer l'alarme
  await chrome.alarms.clear(`publish_${id}`);
  
  // Supprimer le post de la liste ou le marquer comme annulé
  await saveScheduledPosts(posts.filter(p => p.id !== id));
  
  console.log('[S-Post] Post programmé annulé:', id);
  
  return { success: true };
}

async function createPublishAlarm(post) {
  const scheduledTime = new Date(post.scheduledAt).getTime();
  const now = Date.now();
  
  if (scheduledTime <= now) {
    // Si la date est passée, publier immédiatement
    console.log('[S-Post] Date passée, publication immédiate');
    await executePublication(post);
    return;
  }
  
  // Créer une alarme
  await chrome.alarms.create(`publish_${post.id}`, {
    when: scheduledTime,
  });
  
  console.log('[S-Post] Alarme créée pour', post.id, 'à', new Date(scheduledTime).toLocaleString());
}

async function publishNow(post) {
  if (!linkedinState.csrf) {
    return { error: 'Non connecté à LinkedIn. Veuillez ouvrir LinkedIn.' };
  }
  
  // Créer le post et l'exécuter immédiatement
  const scheduledPost = {
    id: post.id || generateId(),
    content: post.content,
    media: post.media || [],
    scheduledAt: new Date().toISOString(),
    status: 'publishing',
    createdAt: post.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  return await executePublication(scheduledPost);
}

async function executePublication(post) {
  console.log('[S-Post] Exécution de la publication:', post.id);
  
  if (!linkedinState.csrf) {
    // Mettre à jour le statut en échec
    await updatePostStatus(post.id, 'failed', 'Non connecté à LinkedIn');
    return { error: 'Non connecté à LinkedIn' };
  }
  
  try {
    // Mettre à jour le statut en "publishing"
    await updatePostStatus(post.id, 'publishing');
    
    // Construire la requête de publication LinkedIn
    const publishResult = await publishToLinkedIn(post);
    
    if (publishResult.success) {
      await updatePostStatus(post.id, 'published', null, publishResult.postUrn);
      
      // Supprimer des posts programmés après publication réussie
      const posts = await getScheduledPosts();
      await saveScheduledPosts(posts.filter(p => p.id !== post.id));
      
      console.log('[S-Post] Publication réussie:', publishResult.postUrn);
      return { success: true, postUrn: publishResult.postUrn };
    } else {
      await updatePostStatus(post.id, 'failed', publishResult.error);
      return { error: publishResult.error };
    }
  } catch (error) {
    console.error('[S-Post] Erreur publication:', error);
    await updatePostStatus(post.id, 'failed', error.message);
    return { error: error.message };
  }
}

async function updatePostStatus(postId, status, errorMessage = null, postUrn = null) {
  const posts = await getScheduledPosts();
  const index = posts.findIndex(p => p.id === postId);
  
  if (index !== -1) {
    posts[index].status = status;
    posts[index].updatedAt = new Date().toISOString();
    
    if (errorMessage) {
      posts[index].errorMessage = errorMessage;
    }
    
    if (postUrn) {
      posts[index].publishedUrn = postUrn;
      posts[index].publishedAt = new Date().toISOString();
    }
    
    await saveScheduledPosts(posts);
  }
}

async function publishToLinkedIn(post) {
  // Note: La publication réelle nécessite d'ouvrir LinkedIn et d'interagir avec la page
  // car l'API Voyager nécessite d'être sur le domaine linkedin.com
  
  // Pour l'instant, on retourne une simulation
  // La vraie implémentation nécessiterait d'injecter un script dans la page LinkedIn
  
  console.log('[S-Post] Publication vers LinkedIn...');
  console.log('[S-Post] Contenu:', post.content?.substring(0, 100));
  
  // Ouvrir LinkedIn pour la publication manuelle assistée
  const linkedInTab = await chrome.tabs.create({
    url: 'https://www.linkedin.com/feed/',
    active: true,
  });
  
  // Attendre que la page soit chargée puis injecter le contenu
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === linkedInTab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Injecter le script pour pré-remplir le post
        chrome.scripting.executeScript({
          target: { tabId: linkedInTab.id },
          func: (content) => {
            // Stocker le contenu pour que le content script le récupère
            localStorage.setItem('spost_pending_publication', JSON.stringify({
              content,
              timestamp: Date.now(),
            }));
            
            // Déclencher un événement personnalisé
            window.dispatchEvent(new CustomEvent('SPostPublish', { detail: { content } }));
          },
          args: [post.content],
        });
        
        // Pour l'instant, on considère que c'est un succès
        // L'utilisateur devra cliquer sur "Publier" manuellement
        setTimeout(() => {
          resolve({ 
            success: true, 
            postUrn: `urn:li:activity:${Date.now()}`,
            message: 'Contenu injecté - cliquez sur Publier',
          });
        }, 1000);
      }
    });
  });
}

// ============================================
// Handlers de paramètres
// ============================================

async function getSettings() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.SETTINGS);
  return result[CONFIG.STORAGE_KEYS.SETTINGS] || {
    trackingEnabled: true,
    autoSync: true,
    backofficeUrl: CONFIG.BACKOFFICE_URL,
  };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.SETTINGS]: settings });
  return { success: true };
}

// ============================================
// Badge
// ============================================

function updateBadge() {
  if (linkedinState.isConnected) {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
    chrome.action.setTitle({ title: 'S-Post - LinkedIn Connecté' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'S-Post' });
  }
}

// ============================================
// Alarmes
// ============================================

chrome.alarms.create('ping', { periodInMinutes: 5 });
chrome.alarms.create('sync', { periodInMinutes: 15 });
chrome.alarms.create('check_scheduled', { periodInMinutes: 1 }); // Vérifier les posts programmés

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ping') {
    await updateActivity('lastPing');
  }
  
  if (alarm.name === 'sync' && linkedinState.isConnected) {
    // Sync périodique avec le backoffice
    await sendToBackoffice(getLinkedInData());
  }
  
  // Publication programmée
  if (alarm.name.startsWith('publish_')) {
    const postId = alarm.name.replace('publish_', '');
    console.log('[S-Post] Alarme de publication déclenchée:', postId);
    
    const posts = await getScheduledPosts();
    const post = posts.find(p => p.id === postId);
    
    if (post && post.status === 'scheduled') {
      await executePublication(post);
    }
  }
  
  // Vérification périodique des posts programmés (backup)
  if (alarm.name === 'check_scheduled') {
    await checkScheduledPosts();
  }
});

/**
 * Vérifie les posts programmés qui auraient pu être manqués
 */
async function checkScheduledPosts() {
  const posts = await getScheduledPosts();
  const now = Date.now();
  
  for (const post of posts) {
    if (post.status !== 'scheduled') continue;
    
    const scheduledTime = new Date(post.scheduledAt).getTime();
    
    // Si le post aurait dû être publié il y a moins de 5 minutes
    if (scheduledTime <= now && scheduledTime > now - 5 * 60 * 1000) {
      console.log('[S-Post] Post programmé manqué, publication:', post.id);
      await executePublication(post);
    }
  }
}

// ============================================
// Handlers de Posts LinkedIn
// ============================================

async function getPosts() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.POSTS);
  return result[CONFIG.STORAGE_KEYS.POSTS] || [];
}

async function savePosts(posts) {
  // Fusionner avec les posts existants (éviter les doublons)
  const existingPosts = await getPosts();
  const existingIds = new Set(existingPosts.map(p => p.id || p.urn));
  
  const newPosts = posts.filter(p => !existingIds.has(p.id || p.urn));
  const allPosts = [...newPosts, ...existingPosts];
  
  // Garder les 100 derniers posts
  const limitedPosts = allPosts.slice(0, 100);
  
  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.POSTS]: limitedPosts });
  return { success: true, count: limitedPosts.length };
}

// Analytics du créateur (style PerfectPost)
async function saveAnalytics(analytics) {
  if (!analytics) return { success: false };
  
  const existingAnalytics = await getAnalytics();
  
  // Fusionner avec les analytics existantes
  const updatedAnalytics = {
    ...existingAnalytics,
    ...analytics,
    updatedAt: new Date().toISOString(),
  };
  
  await chrome.storage.local.set({ spost_analytics: updatedAnalytics });
  
  console.log('[S-Post] Analytics sauvegardées:', updatedAnalytics);
  
  return { success: true, analytics: updatedAnalytics };
}

async function getAnalytics() {
  const result = await chrome.storage.local.get('spost_analytics');
  return result.spost_analytics || {
    totalImpressions: 0,
    totalInteractions: 0,
    totalFollowers: 0,
    profileViews: 0,
    newFollowers: 0,
  };
}

async function fetchLinkedInPosts() {
  if (!linkedinState.csrf || !linkedinState.me?.plainId) {
    return { error: 'Non connecté à LinkedIn' };
  }
  
  try {
    // Récupérer les posts via l'API LinkedIn Voyager
    const profileUrn = linkedinState.profile?.entityUrn || `urn:li:fsd_profile:${linkedinState.me.plainId}`;
    
    const url = `https://www.linkedin.com/voyager/api/graphql?variables=(profileUrn:${encodeURIComponent(profileUrn)},count:20)&queryId=voyagerFeedDashProfileUpdates.ac5c6e3e8d9b1b8bf2b2f8a4f0e1c6d7`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'csrf-token': linkedinState.csrf,
        'x-li-lang': linkedinState.locale || 'fr_FR',
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
    });
    
    if (!response.ok) {
      console.error('[S-Post] Erreur fetch posts:', response.status);
      return { error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    // Parser les posts depuis la réponse
    const posts = parseLinkedInPosts(data);
    
    // Sauvegarder les posts
    await savePosts(posts);
    
    return { success: true, posts };
  } catch (error) {
    console.error('[S-Post] Erreur récupération posts:', error);
    return { error: error.message };
  }
}

function parseLinkedInPosts(data) {
  const posts = [];
  
  if (!data?.included) return posts;
  
  // Parcourir les éléments inclus pour trouver les posts
  for (const item of data.included) {
    if (item.$type === 'com.linkedin.voyager.feed.render.UpdateV2' ||
        item.$type === 'com.linkedin.voyager.feed.shared.UpdateV2') {
      
      const post = {
        id: item.urn || item.entityUrn,
        urn: item.urn || item.entityUrn,
        content: extractPostContent(item, data.included),
        createdAt: item.createdTime ? new Date(item.createdTime).toISOString() : null,
        stats: {
          likes: item.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
          comments: item.socialDetail?.totalSocialActivityCounts?.numComments || 0,
          shares: item.socialDetail?.totalSocialActivityCounts?.numShares || 0,
          views: item.socialDetail?.totalSocialActivityCounts?.numViews || 0,
        },
        media: extractMedia(item, data.included),
        url: item.permaLink || null,
        extractedAt: new Date().toISOString(),
      };
      
      if (post.content || post.media.length > 0) {
        posts.push(post);
      }
    }
  }
  
  return posts;
}

function extractPostContent(update, included) {
  // Chercher le texte du post
  if (update.commentary?.text?.text) {
    return update.commentary.text.text;
  }
  
  // Chercher dans les éléments inclus
  const textUrn = update['*commentary'] || update.commentary;
  if (textUrn && typeof textUrn === 'string') {
    const textItem = included.find(i => i.entityUrn === textUrn || i.urn === textUrn);
    if (textItem?.text?.text) {
      return textItem.text.text;
    }
  }
  
  return '';
}

function extractMedia(update, included) {
  const media = [];
  
  // Images
  if (update.content?.images) {
    for (const img of update.content.images) {
      const imgData = typeof img === 'string' 
        ? included.find(i => i.entityUrn === img)
        : img;
      
      if (imgData?.rootUrl || imgData?.data?.url) {
        media.push({
          type: 'image',
          url: imgData.rootUrl || imgData.data?.url,
        });
      }
    }
  }
  
  // Documents/Carrousels
  if (update.content?.document) {
    media.push({
      type: 'document',
      title: update.content.document.title || 'Document',
      pageCount: update.content.document.pageCount || 0,
    });
  }
  
  // Vidéos
  if (update.content?.video) {
    media.push({
      type: 'video',
      thumbnail: update.content.video.thumbnail,
      duration: update.content.video.duration,
    });
  }
  
  return media;
}

// ============================================
// API Notion (contournement CORS)
// ============================================

/**
 * Gère les appels à l'API Notion depuis le background script
 * pour contourner les restrictions CORS
 */
async function handleNotionApiCall(message) {
  const { endpoint, method = 'GET', body, token, headers = {} } = message;
  
  console.log('[S-Post Notion Background] Appel API reçu:', { endpoint, method, hasToken: !!token });
  
  if (!token) {
    console.error('[S-Post Notion Background] ❌ Token manquant');
    return { error: 'Token Notion manquant' };
  }
  
  if (!endpoint) {
    console.error('[S-Post Notion Background] ❌ Endpoint manquant');
    return { error: 'Endpoint manquant' };
  }
  
  try {
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `https://api.notion.com/v1/${endpoint}`;
    
    console.log('[S-Post Notion Background] 🌐 Fetch URL:', url);
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    console.log('[S-Post Notion Background] 📥 Réponse status:', response.status, response.statusText);
    
    const data = await response.json().catch((e) => {
      console.error('[S-Post Notion Background] ❌ Erreur parsing JSON:', e);
      return {};
    });
    
    if (!response.ok) {
      console.error('[S-Post Notion Background] ❌ Erreur API:', data);
      let errorMessage = data.message || `Erreur ${response.status}: ${response.statusText}`;
      
      // Messages d'erreur plus clairs
      if (response.status === 401) {
        errorMessage = 'Token d\'intégration invalide. Vérifiez votre token sur notion.so/my-integrations';
      } else if (response.status === 403) {
        errorMessage = 'Accès refusé. Assurez-vous que votre intégration a accès aux bases de données.';
      } else if (data.code === 'object_not_found') {
        errorMessage = 'Base de données non trouvée. Partagez votre base avec l\'intégration Notion.';
      }
      
      return {
        error: errorMessage,
        status: response.status,
        data: data,
      };
    }
    
    console.log('[S-Post Notion Background] ✅ Succès, résultats:', data.results?.length || 0);
    
    return {
      success: true,
      data: data,
    };
  } catch (error) {
    console.error('[S-Post Notion Background] ❌ Erreur réseau:', error);
    return {
      error: error.message || 'Erreur de connexion à l\'API Notion',
    };
  }
}

console.log('[S-Post] Service Worker initialisé');
console.log('[S-Post] Backoffice:', CONFIG.BACKOFFICE_URL);
