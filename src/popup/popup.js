/**
 * S-Post - Popup Script
 * Affiche les données LinkedIn et permet d'ouvrir le S-PostBO
 */

const CONFIG = {
  BACKOFFICE_URL: 'http://localhost:5174',
};

// Éléments du DOM
const elements = {
  version: document.getElementById('version'),
  linkedinStatus: document.getElementById('linkedin-status'),
  profileInfo: document.getElementById('profile-info'),
  profileName: document.getElementById('profile-name'),
  lastSync: document.getElementById('last-sync'),
  notConnectedMessage: document.getElementById('not-connected-message'),
  actionsSection: document.getElementById('actions-section'),
  dataSection: document.getElementById('data-section'),
  csrfPreview: document.getElementById('csrf-preview'),
  userIdPreview: document.getElementById('user-id-preview'),
  openBackofficeBtn: document.getElementById('open-backoffice-btn'),
  syncBtn: document.getElementById('sync-btn'),
  copyDataBtn: document.getElementById('copy-data-btn'),
  backofficeLink: document.getElementById('backoffice-link'),
};

// État
let linkedinData = null;

// ============================================
// Initialisation
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  displayVersion();
  await checkLinkedInStatus();
  attachEventListeners();
});

function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  elements.version.textContent = `v${version}`;
  
  // Mettre à jour aussi le footer
  const footerVersion = document.getElementById('version-footer');
  if (footerVersion) {
    footerVersion.textContent = `S-Post v${version}`;
  }
}

// ============================================
// Vérification du statut LinkedIn
// ============================================
async function checkLinkedInStatus() {
  try {
    // Récupérer les données LinkedIn depuis le background
    const response = await sendMessage({ type: 'get_linkedin_data' });
    
    if (response && response.connected) {
      linkedinData = response;
      showConnectedUI(response);
    } else {
      showNotConnectedUI();
    }
    
    // Récupérer l'activité
    const activity = await sendMessage({ type: 'get_activity' });
    if (activity && activity.lastSync) {
      elements.lastSync.textContent = formatDate(activity.lastSync);
    }
    
  } catch (error) {
    console.error('Erreur:', error);
    showNotConnectedUI();
  }
}

function showConnectedUI(data) {
  elements.linkedinStatus.textContent = '✅ Connecté';
  elements.linkedinStatus.classList.add('connected');
  elements.linkedinStatus.classList.remove('disconnected');
  
  elements.profileInfo.style.display = 'block';
  elements.notConnectedMessage.style.display = 'none';
  elements.dataSection.style.display = 'block';
  
  // Afficher le nom du profil
  if (data.profile) {
    const name = `${data.profile.firstName || ''} ${data.profile.lastName || ''}`.trim();
    elements.profileName.textContent = name || data.profile.publicIdentifier || 'Profil LinkedIn';
  } else {
    elements.profileName.textContent = 'Profil détecté';
  }
  
  // Afficher les données extraites
  if (data.csrf) {
    elements.csrfPreview.textContent = data.csrf.substring(0, 20) + '...';
  }
  
  if (data.me && data.me.plainId) {
    elements.userIdPreview.textContent = data.me.plainId;
  }
}

function showNotConnectedUI() {
  elements.linkedinStatus.textContent = '❌ Non connecté';
  elements.linkedinStatus.classList.add('disconnected');
  elements.linkedinStatus.classList.remove('connected');
  
  elements.profileInfo.style.display = 'none';
  elements.notConnectedMessage.style.display = 'block';
  elements.dataSection.style.display = 'none';
}

// ============================================
// Event Listeners
// ============================================
function attachEventListeners() {
  // Ouvrir le backoffice
  elements.openBackofficeBtn.addEventListener('click', openBackoffice);
  
  // Synchroniser
  elements.syncBtn.addEventListener('click', syncData);
  
  // Copier les données
  elements.copyDataBtn.addEventListener('click', copyData);
}

async function openBackoffice() {
  const params = new URLSearchParams({
    source: 'extension',
  });
  
  if (linkedinData && linkedinData.connected) {
    params.set('linkedin_connected', '1');
    
    if (linkedinData.profile) {
      params.set('profile_id', linkedinData.profile.publicIdentifier || '');
      params.set('profile_name', `${linkedinData.profile.firstName || ''} ${linkedinData.profile.lastName || ''}`.trim());
    }
    
    if (linkedinData.csrf) {
      params.set('has_csrf', '1');
    }
  }
  
  const url = `${CONFIG.BACKOFFICE_URL}?${params.toString()}`;
  chrome.tabs.create({ url });
}

async function syncData() {
  elements.syncBtn.disabled = true;
  elements.syncBtn.textContent = '⏳ Synchronisation...';
  
  try {
    // Forcer une nouvelle extraction en ouvrant LinkedIn
    const tabs = await chrome.tabs.query({ url: '*://*.linkedin.com/*' });
    
    if (tabs.length > 0) {
      // Recharger l'onglet LinkedIn pour réextraire les données
      await chrome.tabs.reload(tabs[0].id);
      
      // Attendre un peu puis récupérer les nouvelles données
      setTimeout(async () => {
        await checkLinkedInStatus();
        elements.syncBtn.textContent = '✅ Synchronisé !';
        
        setTimeout(() => {
          elements.syncBtn.disabled = false;
          elements.syncBtn.textContent = '🔄 Synchroniser les données';
        }, 2000);
      }, 3000);
    } else {
      // Pas d'onglet LinkedIn ouvert
      elements.syncBtn.textContent = '⚠️ Ouvrez LinkedIn';
      setTimeout(() => {
        elements.syncBtn.disabled = false;
        elements.syncBtn.textContent = '🔄 Synchroniser les données';
      }, 2000);
    }
  } catch (error) {
    console.error('Erreur sync:', error);
    elements.syncBtn.disabled = false;
    elements.syncBtn.textContent = '🔄 Synchroniser les données';
  }
}

async function copyData() {
  if (!linkedinData) {
    alert('Aucune donnée à copier');
    return;
  }
  
  const dataToCopy = {
    csrf: linkedinData.csrf,
    profile: linkedinData.profile,
    me: linkedinData.me,
    extractedAt: linkedinData.extractedAt,
  };
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
    elements.copyDataBtn.textContent = '✅ Copié !';
    setTimeout(() => {
      elements.copyDataBtn.textContent = '📋 Copier les données';
    }, 2000);
  } catch (error) {
    console.error('Erreur copie:', error);
    alert('Erreur lors de la copie');
  }
}

// ============================================
// Utilitaires
// ============================================
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function formatDate(dateString) {
  if (!dateString) return '-';
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'À l\'instant';
  if (diff < 3600000) return `Il y a ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Il y a ${Math.floor(diff / 3600000)}h`;
  
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
