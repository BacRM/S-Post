/**
 * S-Post - Bridge pour le Backoffice (VERSION SIMPLE)
 * Version stable et simplifiée - LinkedIn uniquement
 */

(function() {
  'use strict';
  
  // Vérifier que l'extension est disponible
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return; // Sortir silencieusement
  }
  
  console.log('[S-Post Bridge] Initialisation');
  
  // ============================================
  // API LinkedIn simple
  // ============================================
  window.SPost = window.LinkedInPlanner = {
    version: chrome.runtime.getManifest().version,
    
    getData: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'get_linkedin_data' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    isConnected: async function() {
      const data = await this.getData();
      return data && data.connected === true;
    },
    
    getProfile: async function() {
      const data = await this.getData();
      return data?.profile || null;
    },
    
    getCsrf: async function() {
      const data = await this.getData();
      return data?.csrf || null;
    },
    
    getLists: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'get_list_refresh' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response || []);
          }
        });
      });
    },
    
    createList: async function(name) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'create_list', name }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    getDrafts: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'get_drafts' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response || []);
          }
        });
      });
    },
    
    saveDraft: async function(draft) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'save_draft', draft }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    deleteDraft: async function(id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'delete_draft', id }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    getPosts: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'get_posts' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response || []);
          }
        });
      });
    },
    
    fetchPosts: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'fetch_linkedin_posts' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    getScheduledPosts: async function() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'get_scheduled_posts' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response || []);
          }
        });
      });
    },
    
    schedulePost: async function(post) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'schedule_post', post }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    updateScheduledPost: async function(post) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'update_scheduled_post', post }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    cancelScheduledPost: async function(id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'cancel_scheduled_post', id }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    publishNow: async function(post) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'publish_now', post }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
    
    cloneDraft: async function(id) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'clone_draft', id }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    },
  };
  
  // ============================================
  // Synchronisation simple vers localStorage
  // ============================================
  async function syncToLocalStorage() {
    try {
      // Lire directement depuis chrome.storage
      const storage = await chrome.storage.local.get(['pp_linkedin_session']);
      const linkedinSession = storage.pp_linkedin_session;
      
      if (linkedinSession && linkedinSession.csrf) {
        const miniProfile = linkedinSession.profile;
        const data = {
          connected: linkedinSession.isConnected !== false,
          csrf: linkedinSession.csrf,
          profile: miniProfile ? {
            entityUrn: miniProfile.entityUrn,
            firstName: miniProfile.firstName,
            lastName: miniProfile.lastName,
            headline: miniProfile.occupation,
            publicIdentifier: miniProfile.publicIdentifier,
            picture: miniProfile.picture?.rootUrl 
              ? `${miniProfile.picture.rootUrl}${miniProfile.picture.artifacts?.[0]?.fileIdentifyingUrlPathSegment || ''}`
              : null,
            profileUrl: miniProfile.publicIdentifier 
              ? `https://www.linkedin.com/in/${miniProfile.publicIdentifier}`
              : null,
          } : null,
          me: linkedinSession.me || null,
          locale: linkedinSession.locale || 'fr',
          extractedAt: linkedinSession.extractedAt || new Date().toISOString(),
        };
        
        localStorage.setItem('spost_linkedin_data', JSON.stringify({
          ...data,
          updatedAt: new Date().toISOString(),
        }));
        
        window.dispatchEvent(new CustomEvent('SPostDataUpdated', { detail: data }));
        console.log('[S-Post Bridge] ✅ Données synchronisées');
      }
      
      // Posts
      try {
        const postsStorage = await chrome.storage.local.get(['pp_posts']);
        const posts = postsStorage.pp_posts || [];
        if (posts && posts.length > 0) {
          localStorage.setItem('spost_posts', JSON.stringify(posts));
        }
      } catch (e) {}
      
      // Brouillons
      try {
        const draftsStorage = await chrome.storage.local.get(['pp_drafts']);
        const drafts = draftsStorage.pp_drafts || [];
        if (drafts && drafts.length > 0) {
          localStorage.setItem('spost_drafts', JSON.stringify(drafts));
        }
      } catch (e) {}
      
      // Posts programmés
      try {
        const scheduledStorage = await chrome.storage.local.get(['pp_scheduled_posts']);
        const scheduled = scheduledStorage.pp_scheduled_posts || [];
        if (scheduled && scheduled.length > 0) {
          localStorage.setItem('spost_scheduled', JSON.stringify(scheduled));
        }
      } catch (e) {}
      
    } catch (error) {
      // Ignorer silencieusement
    }
  }
  
  // Sync après un délai
  setTimeout(syncToLocalStorage, 500);
  setInterval(syncToLocalStorage, 30000);
  
  // Événements ready
  window.dispatchEvent(new CustomEvent('SPostReady', {
    detail: { version: chrome.runtime.getManifest().version }
  }));
  
  console.log('[S-Post Bridge] ✅ Prêt');
  
})();

