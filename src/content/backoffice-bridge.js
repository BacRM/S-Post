/**
 * S-Post - Bridge pour le Backoffice
 * Version SIMPLE et STABLE - LinkedIn uniquement
 */

(function() {
  'use strict';
  
  // Vérifier que l'extension est disponible
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return;
  }
  
  console.log('[S-Post Bridge] Initialisation');
  
  // ============================================
  // ÉCOUTEUR MESSAGES POSTMESSAGE (MISE EN PLACE IMMÉDIATE)
  // Pour Notion et vérification extension - doit être AVANT tout le reste
  // ============================================
  
  // IMPORTANT : Ce listener doit être ajouté EN PREMIER pour répondre immédiatement
  window.addEventListener('message', async (event) => {
    // Ignorer les messages qui ne nous concernent pas
    if (!event.data || !event.data.type) return;
    
    // Vérifier que le message vient de la même origine (page BO)
    if (event.source !== window) return;
    
    const { type, requestId } = event.data;
    
    // Log seulement les messages qui nous concernent
    if (type === 'SPOST_EXTENSION_CHECK' || type === 'SPOST_NOTION_API_CALL') {
      console.log('[S-Post Bridge] Message reçu:', type, 'requestId:', requestId);
    }
    
    // Vérification de disponibilité de l'extension
    if (type === 'SPOST_EXTENSION_CHECK') {
      console.log('[S-Post Bridge] Vérification extension demandée, requestId:', requestId);
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          console.log('[S-Post Bridge] Extension context invalidated');
          window.postMessage({
            type: 'SPOST_EXTENSION_CHECK_RESPONSE',
            requestId: requestId,
            available: false,
            error: 'Extension context invalidated.'
          }, '*');
          return;
        }
        const version = chrome.runtime.getManifest().version;
        console.log('[S-Post Bridge] ✅ Extension disponible, version:', version);
        window.postMessage({
          type: 'SPOST_EXTENSION_CHECK_RESPONSE',
          requestId: requestId,
          available: true,
          version: version
        }, '*');
      } catch (error) {
        console.error('[S-Post Bridge] Erreur lors de la vérification:', error);
        window.postMessage({
          type: 'SPOST_EXTENSION_CHECK_RESPONSE',
          requestId: requestId,
          available: false,
          error: error.message || 'Unknown error'
        }, '*');
      }
      return;
    }
    
    // Appels API Notion (MODULE SÉPARÉ)
    if (type === 'SPOST_NOTION_API_CALL') {
      const { endpoint, method, body, token, headers } = event.data;
      
      console.log('[S-Post Bridge] Appel Notion API reçu:', { endpoint, method, hasToken: !!token });
      
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          window.postMessage({
            type: 'SPOST_NOTION_API_RESPONSE',
            requestId: requestId,
            error: 'Extension context invalidated. Please reload the page.'
          }, '*');
          return;
        }
        
        console.log('[S-Post Bridge] Envoi message au background pour Notion API...');
        
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'notion_api_call',
            endpoint: endpoint,
            method: method,
            body: body,
            token: token,
            headers: headers
          }, (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message || 'Extension error';
              console.error('[S-Post Bridge] Erreur runtime:', errorMsg);
              reject(new Error(errorMsg));
            } else if (response && response.error) {
              console.error('[S-Post Bridge] Erreur dans réponse background:', response.error);
              reject(new Error(response.error));
            } else {
              console.log('[S-Post Bridge] ✅ Réponse reçue du background:', response?.success ? 'succès' : 'échec');
              resolve(response);
            }
          });
        });
        
        console.log('[S-Post Bridge] Envoi réponse à la page, requestId:', requestId);
        window.postMessage({
          type: 'SPOST_NOTION_API_RESPONSE',
          requestId: requestId,
          response: response
        }, '*');
      } catch (error) {
        console.error('[S-Post Bridge] ❌ Erreur Notion API:', error);
        window.postMessage({
          type: 'SPOST_NOTION_API_RESPONSE',
          requestId: requestId,
          error: error.message || error.toString()
        }, '*');
      }
      return;
    }
  });
  
  // Exposer l'API LinkedIn
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
  
  // Synchronisation vers localStorage
  async function syncToLocalStorage() {
    try {
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
        let posts = postsStorage.pp_posts || [];
        if (posts && posts.length > 0) {
          // Calculer les dates depuis les URNs si manquantes
          posts = posts.map(post => {
            // Si le post a déjà une date valide, on la garde
            if (post.createdAt) {
              try {
                const date = new Date(post.createdAt);
                if (!isNaN(date.getTime())) {
                  return post; // Date valide, on garde le post tel quel
                }
              } catch (e) {
                // Date invalide, on va la recalculer
              }
            }
            
            // Essayer d'extraire la date depuis l'URN
            const urn = post.urn || post.id || '';
            const match = urn.match(/activity:(\d+)/) || urn.match(/ugcPost:(\d+)/) || urn.match(/share:(\d+)/);
            if (match && match[1]) {
              try {
                const bigId = BigInt(match[1]);
                const timestamp = Number(bigId >> 22n);
                // Vérifier que le timestamp est raisonnable (entre 2014 et maintenant + 1 jour)
                if (timestamp > 1400000000000 && timestamp < Date.now() + 86400000) {
                  return {
                    ...post,
                    createdAt: new Date(timestamp).toISOString()
                  };
                }
              } catch (e) {
                // Erreur de parsing, on garde le post tel quel
              }
            }
            
            return post;
          });
          
          localStorage.setItem('spost_posts', JSON.stringify(posts));
          const withDates = posts.filter(p => p.createdAt).length;
          console.log('[S-Post Bridge] ✅', posts.length, 'posts synchronisés (', withDates, 'avec dates)');
        }
      } catch (e) {
        console.warn('[S-Post Bridge] Erreur sync posts:', e);
      }
      
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
      console.warn('[S-Post Bridge] Erreur sync:', error);
    }
  }
  
  // Sync immédiat et périodique
  syncToLocalStorage();
  setTimeout(syncToLocalStorage, 500);
  setInterval(syncToLocalStorage, 30000);
  
  // Événements ready
  const version = chrome.runtime.getManifest().version;
  window.dispatchEvent(new CustomEvent('SPostReady', {
    detail: { version: version }
  }));
  window.dispatchEvent(new CustomEvent('LinkedInPlannerReady', {
    detail: { version: version }
  }));
  
  console.log('[S-Post Bridge] ✅ Prêt - LinkedIn + Notion (séparés)');
  
})();
