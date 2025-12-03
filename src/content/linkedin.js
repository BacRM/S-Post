/**
 * S-Post - Content Script v2.1
 * Extraction hybride avancée: API Voyager + Analytics + DOM
 * Inspiré de PerfectPost pour maximum de données
 */

// ============================================
// Configuration S-POST
// ============================================
const PP_CONFIG = {
  DEBUG: true,
  BACKOFFICE_URL: 'http://localhost:5174',
  API_DELAY: 300, // Délai entre les appels API
  ANALYTICS_ENABLED: true, // Activer les appels analytics
};

// ============================================
// Logger
// ============================================
const Logger = {
  log: (...args) => PP_CONFIG.DEBUG && console.log('[S-Post]', ...args),
  warn: (...args) => console.warn('[S-Post]', ...args),
  error: (...args) => console.error('[S-Post]', ...args),
  success: (...args) => console.log('[S-Post] ✅', ...args),
};

// ============================================
// État de la session LinkedIn
// ============================================
let linkedinSession = {
  csrf: null,
  me: null,
  miniProfile: null,
  locale: null,
  isConnected: false,
  posts: [], // Cache des posts extraits
};

// ============================================
// Initialisation
// ============================================
(async function init() {
  Logger.log('Initialisation S-Post v2.0 - Extraction hybride API+DOM');
  
  try {
    // Extraire le CSRF token
    linkedinSession.csrf = extractCsrf();
    linkedinSession.locale = extractLocale();
    
    if (!linkedinSession.csrf) {
      Logger.warn('CSRF non trouvé - Utilisateur non connecté à LinkedIn');
      return;
    }
    
    Logger.log('CSRF extrait:', linkedinSession.csrf.substring(0, 20) + '...');
    
    // Extraire les informations du profil
    await extractProfileWithRetry();
    
    // Envoyer au background script
    await sendDataToBackground();
    
    // Initialiser les fonctionnalités
    initFeatures();
    
    // Détecter si on est sur une page de statistiques de post
    detectAndExtractPostStats();
    
    // Afficher une notification de confirmation
    showNotification('S-Post connecté !', 'success');
    
  } catch (error) {
    Logger.error('Erreur initialisation:', error);
  }
})();

// ============================================
// EXTRACTION HYBRIDE DES POSTS (API + DOM)
// ============================================

/**
 * Extraction hybride : combine API Voyager et DOM pour obtenir le maximum de données
 */
async function extractPostsHybrid() {
  Logger.log('🔄 Extraction hybride des posts (API + DOM)...');
  
  const allPosts = new Map(); // Utiliser une Map pour éviter les doublons
  
  // ÉTAPE 1: Extraction via API Voyager (métadonnées précises)
  Logger.log('📡 Étape 1: Extraction via API Voyager...');
  try {
    const apiPosts = await fetchPostsFromVoyagerAPI();
    for (const post of apiPosts) {
      if (post.id) {
        allPosts.set(post.id, post);
      }
    }
    Logger.log(`API: ${apiPosts.length} posts récupérés`);
  } catch (e) {
    Logger.warn('API Voyager non disponible:', e.message);
  }
  
  // ÉTAPE 2: Extraction via les balises <code> (données JSON internes)
  Logger.log('📄 Étape 2: Extraction via balises <code>...');
  try {
    const codePosts = extractPostsFromCodeTags();
    for (const post of codePosts) {
      if (post.id && !allPosts.has(post.id)) {
        allPosts.set(post.id, post);
      } else if (post.id) {
        // Fusionner les données
        const existing = allPosts.get(post.id);
        allPosts.set(post.id, mergePostData(existing, post));
      }
    }
    Logger.log(`Code tags: ${codePosts.length} posts trouvés`);
  } catch (e) {
    Logger.warn('Extraction code tags:', e.message);
  }
  
  // ÉTAPE 3: Extraction via DOM (stats visibles à l'écran)
  Logger.log('🖥️ Étape 3: Extraction via DOM...');
  try {
    const domPosts = extractPostsFromDOM();
    for (const post of domPosts) {
      const matchingPost = findMatchingPost(allPosts, post);
      if (matchingPost) {
        // Enrichir avec les stats DOM (souvent plus précises pour likes/comments visibles)
        allPosts.set(matchingPost.id, mergePostData(matchingPost, post));
      } else if (post.content && post.content.length > 20) {
        // Nouveau post non trouvé via API
        const id = post.id || `dom-${hashCode(post.content)}`;
        allPosts.set(id, { ...post, id });
      }
    }
    Logger.log(`DOM: ${domPosts.length} posts trouvés`);
  } catch (e) {
    Logger.warn('Extraction DOM:', e.message);
  }
  
  // ÉTAPE 4: Désactivé - génère trop d'erreurs 404
  // Les stats sont déjà récupérées via le DOM
  const postsArray = Array.from(allPosts.values());
  
  // Convertir en array et trier par date
  const finalPosts = postsArray
    .filter(p => p.content && p.content.length > 10)
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
      return dateB - dateA;
    });
  
  Logger.success(`${finalPosts.length} posts extraits au total`);
  
  // Sauvegarder
  linkedinSession.posts = finalPosts;
  await sendMessage({ type: 'save_posts', posts: finalPosts });
  
  // Sauvegarder aussi en localStorage pour le BO
  try {
    localStorage.setItem('spost_posts', JSON.stringify(finalPosts));
    localStorage.setItem('spost_last_sync', new Date().toISOString());
  } catch (e) {}
  
  return finalPosts;
}

/**
 * Récupère les posts via l'API Voyager de LinkedIn
 */
async function fetchPostsFromVoyagerAPI() {
  if (!linkedinSession.csrf || !linkedinSession.miniProfile) {
    return [];
  }
  
  const posts = [];
  const publicId = linkedinSession.miniProfile.publicIdentifier;
  
  // API 1: Feed updates (posts récents)
  try {
    const feedUrl = `https://www.linkedin.com/voyager/api/feed/updates?count=50&moduleKey=creator_profile_all&numComments=0&numLikes=0&profileUrn=urn%3Ali%3Afsd_profile%3A${linkedinSession.me?.plainId || ''}&q=profileRecentActivity&start=0`;
    
    const response = await fetch(feedUrl, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-li-lang': linkedinSession.locale || 'fr_FR',
        'x-restli-protocol-version': '2.0.0',
      },
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      const parsed = parseVoyagerResponse(data);
      posts.push(...parsed);
    }
  } catch (e) {
    Logger.warn('API feed updates:', e.message);
  }
  
  // API 2: Profile updates (historique plus long)
  try {
    const profileUrn = `urn:li:fsd_profile:${linkedinSession.me?.plainId || ''}`;
    const updatesUrl = `https://www.linkedin.com/voyager/api/identity/profileUpdatesV2?count=100&includeLongTermHistory=true&moduleKey=creator_profile_all&numComments=0&numLikes=0&profileUrn=${encodeURIComponent(profileUrn)}&q=memberShareFeed&start=0`;
    
    const response = await fetch(updatesUrl, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-li-lang': linkedinSession.locale || 'fr_FR',
      },
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      const parsed = parseVoyagerResponse(data);
      posts.push(...parsed);
    }
  } catch (e) {
    Logger.warn('API profile updates:', e.message);
  }
  
  // API 3: GraphQL pour les données détaillées
  try {
    const graphqlPosts = await fetchPostsGraphQL();
    posts.push(...graphqlPosts);
  } catch (e) {
    Logger.warn('GraphQL:', e.message);
  }
  
  return posts;
}

/**
 * Récupère les posts via l'API GraphQL de LinkedIn
 */
async function fetchPostsGraphQL() {
  const posts = [];
  
  try {
    const variables = {
      profileUrn: `urn:li:fsd_profile:${linkedinSession.me?.plainId || ''}`,
      count: 50,
      start: 0,
    };
    
    const url = `https://www.linkedin.com/voyager/api/graphql?queryId=voyagerFeedDashProfileUpdatesByMemberShareFeed.34dd0fbe7837a1e3ba9587f7e0f84e7f&variables=${encodeURIComponent(JSON.stringify(variables))}`;
    
    const response = await fetch(url, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/graphql',
        'x-li-lang': linkedinSession.locale || 'fr_FR',
      },
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data?.data?.feedDashProfileUpdatesByMemberShareFeedConnection?.elements) {
        for (const element of data.data.feedDashProfileUpdatesByMemberShareFeedConnection.elements) {
          const post = parseGraphQLPost(element);
          if (post) posts.push(post);
        }
      }
    }
  } catch (e) {
    // GraphQL peut ne pas être disponible
  }
  
  return posts;
}

/**
 * Parse un post depuis la réponse GraphQL
 */
function parseGraphQLPost(element) {
  try {
    const update = element.update || element;
    
    // Extraire la date depuis plusieurs sources possibles
    let createdAt = null;
    const dateValue = update.postedAt || update.createdAt || update.createdTime || 
                      update.publishedAt || element.postedAt || element.createdTime;
    
    if (dateValue) {
      if (typeof dateValue === 'number') {
        createdAt = new Date(dateValue).toISOString();
      } else if (typeof dateValue === 'string') {
        const parsed = Date.parse(dateValue);
        if (!isNaN(parsed)) {
          createdAt = new Date(parsed).toISOString();
        }
      }
    }
    
    // Fallback: essayer d'extraire du URN avec BigInt
    const urn = update.urn || update.entityUrn;
    if (!createdAt && urn) {
      try {
        const activityId = urn.replace('urn:li:activity:', '').replace('urn:li:ugcPost:', '').replace('urn:li:share:', '');
        const numericId = BigInt(activityId);
        // LinkedIn: timestamp = id >> 22 (SANS epoch!)
        const timestamp = Number(numericId >> 22n);
        if (timestamp > 1400000000000 && timestamp < Date.now() + 86400000) {
          createdAt = new Date(timestamp).toISOString();
        }
      } catch (e) {}
    }
    
    return {
      id: urn,
      urn: urn,
      content: update.commentary?.text?.text || '',
      createdAt: createdAt,
      stats: {
        likes: update.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
        comments: update.socialDetail?.totalSocialActivityCounts?.numComments || 0,
        shares: update.socialDetail?.totalSocialActivityCounts?.numShares || 0,
        views: update.socialDetail?.totalSocialActivityCounts?.numImpressions || 0,
      },
      media: [],
      url: update.permaLink,
      source: 'graphql',
    };
  } catch (e) {
    return null;
  }
}

/**
 * Récupère les statistiques détaillées d'un post via l'API
 */
async function fetchPostStats(postUrn) {
  try {
    // API pour les stats sociales
    const activityUrn = postUrn.replace('urn:li:activity:', '');
    const url = `https://www.linkedin.com/voyager/api/feed/socialActions/${encodeURIComponent(postUrn)}`;
    
    const response = await fetch(url, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      
      return {
        likes: data.data?.totalReactionCounts?.reduce((sum, r) => sum + (r.count || 0), 0) || 0,
        comments: data.data?.commentCount || 0,
        shares: data.data?.repostCount || 0,
      };
    }
  } catch (e) {}
  
  return null;
}

// ============================================
// ANALYTICS AVANCÉES (Style PerfectPost)
// ============================================

/**
 * Récupère les analytics globales du créateur (impressions, abonnés, etc.)
 */
async function fetchCreatorAnalytics() {
  if (!linkedinSession.csrf || !linkedinSession.me?.plainId) {
    return null;
  }
  
  const analytics = {
    totalImpressions: 0,
    totalInteractions: 0,
    totalFollowers: 0,
    profileViews: 0,
    newFollowers: 0,
    fetchedAt: new Date().toISOString(),
  };
  
  try {
    // 1. Récupérer le nombre d'abonnés via le profil
    const profileUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${linkedinSession.me.publicIdentifier}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    
    const profileResponse = await fetch(profileUrl, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });
    
    if (profileResponse.ok) {
      const profileData = await profileResponse.json();
      
      // Chercher le nombre de followers dans les données
      if (profileData?.included) {
        for (const item of profileData.included) {
          if (item.followersCount !== undefined) {
            analytics.totalFollowers = item.followersCount;
          }
          if (item.connectionsCount !== undefined) {
            analytics.connections = item.connectionsCount;
          }
        }
      }
    }
    
    await sleep(PP_CONFIG.API_DELAY);
    
    // 2. Récupérer les vues de profil
    const viewsUrl = `https://www.linkedin.com/voyager/api/identity/wvmpCards?q=cardType&cardType=WHO_VIEWED_ME_PREMIUM_PROFILE_DETAILS`;
    
    const viewsResponse = await fetch(viewsUrl, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });
    
    if (viewsResponse.ok) {
      const viewsData = await viewsResponse.json();
      
      if (viewsData?.included) {
        for (const item of viewsData.included) {
          if (item.totalViewCount !== undefined) {
            analytics.profileViews = item.totalViewCount;
          }
          if (item.viewerCount !== undefined) {
            analytics.uniqueViewers = item.viewerCount;
          }
        }
      }
    }
    
    await sleep(PP_CONFIG.API_DELAY);
    
    // 3. Récupérer les analytics du créateur (si disponible)
    const creatorUrl = `https://www.linkedin.com/voyager/api/contentcreation/analytics/overview?q=overview`;
    
    const creatorResponse = await fetch(creatorUrl, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });
    
    if (creatorResponse.ok) {
      const creatorData = await creatorResponse.json();
      
      if (creatorData?.data) {
        analytics.totalImpressions = creatorData.data.totalImpressions || 0;
        analytics.totalInteractions = creatorData.data.totalEngagements || 0;
        analytics.newFollowers = creatorData.data.newFollowers || 0;
      }
      
      // Chercher aussi dans included
      if (creatorData?.included) {
        for (const item of creatorData.included) {
          if (item.impressionCount !== undefined) {
            analytics.totalImpressions = Math.max(analytics.totalImpressions, item.impressionCount);
          }
          if (item.engagementCount !== undefined) {
            analytics.totalInteractions = Math.max(analytics.totalInteractions, item.engagementCount);
          }
        }
      }
    }
    
    // Sauvegarder les analytics
    linkedinSession.analytics = analytics;
    
    try {
      localStorage.setItem('spost_analytics', JSON.stringify(analytics));
    } catch (e) {}
    
    Logger.success(`Analytics récupérées: ${analytics.totalFollowers} abonnés, ${analytics.profileViews} vues profil`);
    
    return analytics;
    
  } catch (e) {
    Logger.warn('Erreur récupération analytics:', e.message);
    return null;
  }
}

/**
 * Récupère les analytics détaillées d'un post spécifique
 */
async function fetchDetailedPostAnalytics(activityUrn) {
  if (!linkedinSession.csrf) return null;
  
  try {
    // API d'analytics par post
    const url = `https://www.linkedin.com/voyager/api/contentcreation/analytics/contentAnalytics?activityUrn=${encodeURIComponent(activityUrn)}`;
    
    const response = await fetch(url, {
      headers: {
        'csrf-token': linkedinSession.csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });
    
    if (response.ok) {
      const data = await response.json();
      
      return {
        impressions: data.data?.impressionCount || 0,
        uniqueViews: data.data?.uniqueViewCount || 0,
        engagements: data.data?.engagementCount || 0,
        profileClicks: data.data?.profileClickCount || 0,
        reactions: data.data?.reactionCount || 0,
        comments: data.data?.commentCount || 0,
        shares: data.data?.shareCount || 0,
      };
    }
  } catch (e) {}
  
  return null;
}

/**
 * Parse la réponse de l'API Voyager
 */
function parseVoyagerResponse(data) {
  const posts = [];
  
  if (!data?.included) return posts;
  
  // Créer un index des objets inclus
  const includedIndex = new Map();
  for (const item of data.included) {
    if (item.entityUrn || item.urn) {
      includedIndex.set(item.entityUrn || item.urn, item);
    }
  }
  
  // Chercher les updates
  for (const item of data.included) {
    const type = item.$type || '';
    
    if (type.includes('Update') || type.includes('Activity') || 
        (item.entityUrn && item.entityUrn.includes('activity'))) {
      
      try {
        // Extraire le contenu
        let content = '';
        
        // Méthode 1: Directement sur l'objet
        if (item.commentary?.text?.text) {
          content = item.commentary.text.text;
        }
        
        // Méthode 2: Via référence
        if (!content && item['*commentary']) {
          const commentary = includedIndex.get(item['*commentary']);
          if (commentary?.text?.text) {
            content = commentary.text.text;
          }
        }
        
        // Méthode 3: Via resharedUpdate
        if (!content && item['*resharedUpdate']) {
          const reshared = includedIndex.get(item['*resharedUpdate']);
          if (reshared?.commentary?.text?.text) {
            content = `[Repartagé] ${reshared.commentary.text.text}`;
          }
        }
        
        const urn = item.urn || item.entityUrn;
        
        if (!urn) continue;
        
        // Stats
        let stats = { likes: 0, comments: 0, shares: 0, views: 0, saves: 0, sends: 0 };
        
        if (item.socialDetail) {
          const counts = item.socialDetail.totalSocialActivityCounts || {};
          stats = {
            likes: counts.numLikes || 0,
            comments: counts.numComments || 0,
            shares: counts.numShares || counts.numReposts || 0,
            views: counts.numImpressions || counts.numViews || 0,
            saves: counts.numSaves || counts.numBookmarks || 0,
            sends: counts.numSends || counts.numShares || 0,
          };
        }
        
        // Chercher les stats dans les objets liés
        if (item['*socialDetail']) {
          const socialDetail = includedIndex.get(item['*socialDetail']);
          if (socialDetail?.totalSocialActivityCounts) {
            const counts = socialDetail.totalSocialActivityCounts;
            stats = {
              likes: counts.numLikes || stats.likes,
              comments: counts.numComments || stats.comments,
              shares: counts.numShares || stats.shares,
              views: counts.numImpressions || counts.numViews || stats.views,
            };
          }
        }
        
        // Date - Essayer plusieurs sources (comme PerfectPost)
        // LinkedIn stocke lastModifiedAt comme timestamp principal
        let createdAt = null;
        let lastModifiedAt = null;
        
        // Sources de dates possibles dans les données LinkedIn
        const dateFields = {
          // Timestamp de création
          createdTime: item.createdTime,
          postedAt: item.postedAt,
          // Timestamp de modification (souvent plus fiable)
          lastModifiedTime: item.lastModifiedTime,
          lastModifiedAt: item.lastModifiedAt,
          modifiedAt: item.modifiedAt,
          // Autres sources
          publishedAt: item.publishedAt,
          actorTimestamp: item.actorTimestamp,
          // Dans actor.subDescription (texte "il y a X jours")
          actorSubDesc: item.actor?.subDescription?.text,
        };
        
        // Priorité 1: timestamps numériques directs
        for (const [key, value] of Object.entries(dateFields)) {
          if (typeof value === 'number' && value > 0) {
            const date = new Date(value).toISOString();
            if (key.includes('Modified')) {
              lastModifiedAt = date;
            } else {
              createdAt = createdAt || date;
            }
          }
        }
        
        // Priorité 2: texte parseable
        if (!createdAt) {
          for (const [key, value] of Object.entries(dateFields)) {
            if (typeof value === 'string' && value) {
              // Essayer de parser directement
              const parsed = Date.parse(value);
              if (!isNaN(parsed) && parsed > 0) {
                createdAt = new Date(parsed).toISOString();
                break;
              }
              // Parser les dates relatives ("il y a 2 jours", "2d", "15m")
              const relativeDate = parseRelativeDate(value);
              if (relativeDate) {
                createdAt = relativeDate;
                break;
              }
            }
          }
        }
        
        // Priorité 3: Chercher dans les éléments liés (included)
        if (!createdAt && item['*updateMetadata']) {
          const metadata = includedIndex.get(item['*updateMetadata']);
          if (metadata) {
            if (metadata.createdAt) createdAt = new Date(metadata.createdAt).toISOString();
            if (metadata.lastModifiedAt) lastModifiedAt = new Date(metadata.lastModifiedAt).toISOString();
          }
        }
        
        // Priorité 4: Extraire depuis l'URN de l'activité
        // LinkedIn encode le timestamp directement: timestamp = id >> 22 (PAS d'epoch à ajouter!)
        // IMPORTANT: Utiliser BigInt car les IDs ont 19 chiffres (dépasse Number.MAX_SAFE_INTEGER)
        if (!createdAt && urn) {
          const activityId = urn.replace('urn:li:activity:', '').replace('urn:li:ugcPost:', '').replace('urn:li:share:', '');
          try {
            const numericId = BigInt(activityId);
            // LinkedIn: timestamp = id >> 22 (SANS epoch!)
            const timestamp = Number(numericId >> 22n);
            if (timestamp > 1400000000000 && timestamp < Date.now() + 86400000) {
              createdAt = new Date(timestamp).toISOString();
              Logger.log(`📅 Date extraite de l'URN ${activityId}: ${createdAt}`);
            }
          } catch (e) {
            Logger.warn(`Impossible de parser l'URN: ${activityId}`);
          }
        }
        
        // Utiliser lastModifiedAt si pas de createdAt
        createdAt = createdAt || lastModifiedAt;
        
        Logger.log(`Post ${urn}: date=${createdAt}`);
        
        
        // Médias
        const media = extractMediaFromItem(item, includedIndex);
        
        posts.push({
          id: urn,
          urn: urn,
          content: content,
          createdAt: createdAt,
          stats: stats,
          media: media,
          url: item.permaLink || `https://www.linkedin.com/feed/update/${urn}`,
          source: 'voyager_api',
          extractedAt: new Date().toISOString(),
        });
        
      } catch (e) {
        Logger.warn('Parse post error:', e);
      }
    }
  }
  
  return posts;
}

/**
 * Extrait les médias d'un item Voyager
 */
function extractMediaFromItem(item, includedIndex) {
  const media = [];
  
  try {
    // Images
    if (item.content?.images) {
      for (const imgRef of item.content.images) {
        const img = typeof imgRef === 'string' ? includedIndex.get(imgRef) : imgRef;
        if (img?.rootUrl || img?.data?.url) {
          media.push({ type: 'image', url: img.rootUrl || img.data?.url });
        }
      }
    }
    
    // Document/Carrousel
    if (item.content?.document || item.document) {
      const doc = item.content?.document || item.document;
      media.push({
        type: 'document',
        title: doc.title || 'Carrousel',
        pageCount: doc.pageCount || 0,
      });
    }
    
    // Vidéo
    if (item.content?.video || item.video) {
      const video = item.content?.video || item.video;
      media.push({
        type: 'video',
        duration: video.duration,
        thumbnail: video.thumbnail?.rootUrl,
      });
    }
    
    // Article
    if (item.content?.article) {
      media.push({
        type: 'article',
        title: item.content.article.title,
        url: item.content.article.url,
      });
    }
  } catch (e) {}
  
  return media;
}

/**
 * Extraction des posts depuis le DOM (stats visibles)
 */
function extractPostsFromDOM() {
  const posts = [];
  
  // Sélecteurs pour les différents types de conteneurs de posts
  const containerSelectors = [
    '.profile-creator-shared-feed-update__container',
    '.feed-shared-update-v2',
    '[data-urn*="activity"]',
    '.occludable-update',
    '[class*="feed-shared"]',
  ];
  
  const containers = document.querySelectorAll(containerSelectors.join(', '));
  Logger.log(`DOM: ${containers.length} conteneurs trouvés`);
  
  for (const container of containers) {
    try {
      const post = extractPostFromContainer(container);
      if (post && post.content && post.content.length > 10) {
        posts.push(post);
      }
    } catch (e) {}
  }
  
  return posts;
}

/**
 * Extrait un post depuis un conteneur DOM
 */
function extractPostFromContainer(container) {
  const post = {
    id: null,
    urn: null,
    content: '',
    createdAt: null,
    stats: { likes: 0, comments: 0, shares: 0, views: 0, saves: 0, sends: 0 },
    media: [],
    source: 'dom',
  };
  
  // URN
  const urn = container.getAttribute('data-urn');
  if (urn) {
    post.id = urn;
    post.urn = urn;
  }
  
  // Contenu - essayer plusieurs sélecteurs
  const textSelectors = [
    '.feed-shared-update-v2__description',
    '.update-components-text',
    '.feed-shared-text',
    '.break-words',
    '[data-test-id="main-feed-activity-card__commentary"]',
    '.feed-shared-inline-show-more-text',
  ];
  
  for (const selector of textSelectors) {
    const el = container.querySelector(selector);
    if (el?.textContent?.trim()) {
      post.content = el.textContent.trim();
      break;
    }
  }
  
  // Fallback: spans avec dir="ltr"
  if (!post.content) {
    const spans = container.querySelectorAll('span[dir="ltr"]');
    for (const span of spans) {
      const text = span.textContent?.trim();
      if (text && text.length > 50) {
        post.content = text;
        break;
      }
    }
  }
  
  // Stats depuis le texte complet du container
  const fullText = container.innerText || '';
  
  // Likes - plusieurs patterns
  const likesPatterns = [
    /(\d+[\s,.\u00a0]?\d*)\s*(réaction|reaction|like|j'aime)/i,
    /(\d+)\s*$/m,
  ];
  
  for (const pattern of likesPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const num = parseInt(match[1].replace(/[\s,.\u00a0]/g, ''));
      if (num > 0 && num < 1000000) {
        post.stats.likes = num;
        break;
      }
    }
  }
  
  // Commentaires
  const commentsMatch = fullText.match(/(\d+)\s*(comment|commentaire)/i);
  if (commentsMatch) {
    post.stats.comments = parseInt(commentsMatch[1]) || 0;
  }
  
  // Vues/Impressions
  const viewsMatch = fullText.match(/(\d+[\s,.\u00a0]?\d*)\s*(vue|view|impression)/i);
  if (viewsMatch) {
    post.stats.views = parseInt(viewsMatch[1].replace(/[\s,.\u00a0]/g, '')) || 0;
  }
  
  // Enregistrements (saves/bookmarks)
  const savesMatch = fullText.match(/(\d+)\s*(enregistrement|save|bookmark)/i);
  if (savesMatch) {
    post.stats.saves = parseInt(savesMatch[1]) || 0;
  }
  
  // Partages/Reposts/Republications
  const sharesMatch = fullText.match(/(\d+)\s*(partage|repost|share|republication|diffusion)/i);
  if (sharesMatch) {
    post.stats.shares = parseInt(sharesMatch[1]) || 0;
  }
  
  // Alternative: chercher "X personnes ont republié"
  const republishMatch = fullText.match(/(\d+)\s*personnes?\s*ont\s*republié/i);
  if (republishMatch && !post.stats.shares) {
    post.stats.shares = parseInt(republishMatch[1]) || 0;
  }
  
  // Date
  const timeEl = container.querySelector('time');
  if (timeEl) {
    const datetime = timeEl.getAttribute('datetime');
    if (datetime) {
      post.createdAt = datetime;
    } else {
      // Parser le texte de date relatif
      post.createdAt = parseRelativeDate(timeEl.textContent);
    }
  }
  
  // Médias
  if (container.querySelector('video, [class*="video"]')) {
    post.media.push({ type: 'video' });
  }
  if (container.querySelector('[class*="document"], [class*="carousel"]')) {
    post.media.push({ type: 'document' });
  }
  const images = container.querySelectorAll('img[src*="media"]:not([src*="profile"]):not([src*="avatar"])');
  for (const img of images) {
    if (img.src) post.media.push({ type: 'image', url: img.src });
  }
  
  return post;
}

/**
 * Parse une date relative en ISO string
 */
function parseRelativeDate(text) {
  if (!text) return null;
  
  const now = Date.now();
  const t = text.toLowerCase().trim();
  
  // Extraire le nombre du texte
  const numMatch = t.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]) : 1;
  
  // Minutes (15m, 15 min, il y a 15 minutes)
  if (/\bm\b|min|minute/.test(t)) {
    return new Date(now - num * 60000).toISOString();
  }
  
  // Heures (2h, 2 hr, il y a 2 heures)
  if (/\bh\b|hr|hour|heure/.test(t)) {
    return new Date(now - num * 3600000).toISOString();
  }
  
  // Jours (3d, 3 days, il y a 3 jours)
  if (/\bd\b|day|jour/.test(t)) {
    return new Date(now - num * 86400000).toISOString();
  }
  
  // Semaines (2w, 2 weeks, il y a 2 semaines)
  if (/\bw\b|week|sem/.test(t)) {
    return new Date(now - num * 7 * 86400000).toISOString();
  }
  
  // Mois (3mo, 3 months, il y a 3 mois)
  if (/\bmo\b|month|mois/.test(t)) {
    return new Date(now - num * 30 * 86400000).toISOString();
  }
  
  // Années (1y, 1 year, il y a 1 an)
  if (/\by\b|yr|year|an/.test(t)) {
    return new Date(now - num * 365 * 86400000).toISOString();
  }
  
  // "maintenant", "now", "just now"
  if (/now|maintenant|just|instant/.test(t)) {
    return new Date(now).toISOString();
  }
  
  // "hier", "yesterday"
  if (/yesterday|hier/.test(t)) {
    return new Date(now - 86400000).toISOString();
  }
  
  return null; // Retourner null si on ne peut pas parser
}

/**
 * Extrait les posts depuis les balises <code> (données JSON internes)
 */
function extractPostsFromCodeTags() {
  const posts = [];
  const codeElements = document.querySelectorAll('code');
  
  for (const code of codeElements) {
    try {
      const content = code.textContent;
      if (!content || content.length < 100) continue;
      
      const data = JSON.parse(content);
      
      if (data?.included && Array.isArray(data.included)) {
        const parsed = parseVoyagerResponse(data);
        posts.push(...parsed);
      }
    } catch {
      continue;
    }
  }
  
  return posts;
}

/**
 * Trouve un post correspondant dans la Map (par URN ou par contenu similaire)
 */
function findMatchingPost(postsMap, newPost) {
  // Match par URN exact
  if (newPost.urn && postsMap.has(newPost.urn)) {
    return postsMap.get(newPost.urn);
  }
  if (newPost.id && postsMap.has(newPost.id)) {
    return postsMap.get(newPost.id);
  }
  
  // Match par contenu similaire
  if (newPost.content && newPost.content.length > 50) {
    const contentStart = newPost.content.substring(0, 100);
    for (const [id, post] of postsMap) {
      if (post.content && post.content.startsWith(contentStart)) {
        return post;
      }
    }
  }
  
  return null;
}

/**
 * Fusionne deux objets post en gardant les meilleures données
 */
function mergePostData(existing, newData) {
  return {
    id: existing.id || newData.id,
    urn: existing.urn || newData.urn,
    content: existing.content || newData.content,
    createdAt: existing.createdAt || newData.createdAt,
    stats: {
      likes: Math.max(existing.stats?.likes || 0, newData.stats?.likes || 0),
      comments: Math.max(existing.stats?.comments || 0, newData.stats?.comments || 0),
      shares: Math.max(existing.stats?.shares || 0, newData.stats?.shares || 0),
      views: Math.max(existing.stats?.views || 0, newData.stats?.views || 0),
      saves: Math.max(existing.stats?.saves || 0, newData.stats?.saves || 0),
      sends: Math.max(existing.stats?.sends || 0, newData.stats?.sends || 0),
    },
    media: [...(existing.media || []), ...(newData.media || [])].filter((m, i, arr) => 
      i === arr.findIndex(x => x.type === m.type && x.url === m.url)
    ),
    url: existing.url || newData.url,
    source: `${existing.source || 'unknown'}+${newData.source || 'unknown'}`,
    extractedAt: new Date().toISOString(),
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// EXTRACTION PROFIL
// ============================================

async function extractProfileWithRetry(maxRetries = 5, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    Logger.log(`Tentative extraction profil ${i + 1}/${maxRetries}...`);
    
    extractProfileInfo();
    
    if (!linkedinSession.miniProfile) {
      extractProfileFromPage();
    }
    
    if (linkedinSession.miniProfile) {
      Logger.success(`Profil extrait: ${linkedinSession.miniProfile.firstName} ${linkedinSession.miniProfile.lastName}`);
      return;
    }
    
    if (i < maxRetries - 1) {
      await sleep(delay);
    }
  }
  
  Logger.warn('⚠️ Profil non trouvé après tous les essais');
}

async function sendDataToBackground() {
  const response = await sendMessage({
    type: 'csrf',
    csrf: linkedinSession.csrf,
    miniProfile: linkedinSession.miniProfile,
    me: linkedinSession.me,
    locale: linkedinSession.locale,
  });
  
  linkedinSession.isConnected = true;
  Logger.log('Données envoyées au background:', response);
  
  // Récupérer les analytics du créateur en arrière-plan
  if (PP_CONFIG.ANALYTICS_ENABLED) {
    setTimeout(async () => {
      try {
        Logger.log('📊 Récupération des analytics du créateur...');
        const analytics = await fetchCreatorAnalytics();
        
        if (analytics) {
          // Envoyer au background
          await sendMessage({
            type: 'save_analytics',
            analytics: analytics,
          });
          
          // Synchroniser avec le localStorage pour le BO
          try {
            const linkedinData = JSON.parse(localStorage.getItem('spost_linkedin_data') || '{}');
            linkedinData.analytics = analytics;
            localStorage.setItem('spost_linkedin_data', JSON.stringify(linkedinData));
            
            // Dispatcher un événement pour le BO
            window.dispatchEvent(new CustomEvent('SPostAnalyticsUpdated', { detail: analytics }));
          } catch (e) {}
        }
      } catch (e) {
        Logger.warn('Erreur récupération analytics:', e.message);
      }
    }, 2000); // Attendre 2 secondes avant de récupérer les analytics
  }
}

function extractCsrf() {
  const match = /JSESSIONID="?([^";]+)"?/.exec(document.cookie);
  return match ? match[1] : null;
}

function extractLocale() {
  const match = /PLAY_LANG="?([^";]+)"?/.exec(document.cookie);
  return match ? match[1] : 'fr';
}

function extractProfileInfo() {
  const codeElements = document.querySelectorAll('code');
  
  for (const code of codeElements) {
    try {
      const content = code.textContent;
      if (!content) continue;
      
      const data = JSON.parse(content);
      
      if (data && typeof data === 'object' && 'data' in data && 'included' in data) {
        const me = data.data;
        const included = data.included;
        
        if (isValidMe(me) && Array.isArray(included)) {
          linkedinSession.me = me;
          
          linkedinSession.miniProfile = included.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              '$type' in item &&
              item.$type === 'com.linkedin.voyager.identity.shared.MiniProfile' &&
              'entityUrn' in item &&
              item.entityUrn === me['*miniProfile']
          );
          
          if (linkedinSession.miniProfile) break;
        }
      }
    } catch {
      continue;
    }
  }
}

function extractProfileFromPage() {
  // Méthode 1: global-nav
  const navProfileLink = document.querySelector('.global-nav__me a[href*="/in/"]');
  if (navProfileLink) {
    const href = navProfileLink.getAttribute('href');
    const match = href?.match(/\/in\/([^\/\?]+)/);
    if (match) {
      linkedinSession.miniProfile = {
        publicIdentifier: match[1],
        firstName: 'Utilisateur',
        lastName: 'LinkedIn',
      };
      return;
    }
  }
  
  // Méthode 2: feed-identity-module
  const identityModule = document.querySelector('.feed-identity-module');
  if (identityModule) {
    const linkEl = identityModule.querySelector('a[href*="/in/"]');
    const nameEl = identityModule.querySelector('.feed-identity-module__actor-meta, .t-16');
    
    if (linkEl) {
      const href = linkEl.getAttribute('href');
      const match = href?.match(/\/in\/([^\/\?]+)/);
      if (match) {
        const fullName = nameEl?.textContent?.trim() || '';
        const nameParts = fullName.split(' ');
        linkedinSession.miniProfile = {
          publicIdentifier: match[1],
          firstName: nameParts[0] || 'Utilisateur',
          lastName: nameParts.slice(1).join(' ') || 'LinkedIn',
        };
        return;
      }
    }
  }
  
  // Méthode 3: Page profil
  if (window.location.pathname.includes('/in/')) {
    const match = window.location.pathname.match(/\/in\/([^\/\?]+)/);
    if (match) {
      const nameEl = document.querySelector('.text-heading-xlarge, h1.text-heading-xlarge');
      const fullName = nameEl?.textContent?.trim() || '';
      const nameParts = fullName.split(' ');
      linkedinSession.miniProfile = {
        publicIdentifier: match[1],
        firstName: nameParts[0] || 'Utilisateur',
        lastName: nameParts.slice(1).join(' ') || 'LinkedIn',
      };
    }
  }
}

function isValidMe(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    '$type' in obj &&
    obj.$type === 'com.linkedin.voyager.common.Me' &&
    'plainId' in obj &&
    typeof obj.plainId === 'number' &&
    '*miniProfile' in obj
  );
}

// ============================================
// COMMUNICATION BACKGROUND
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

// ============================================
// FONCTIONNALITÉS
// ============================================

function initFeatures() {
  observeUrlChanges();
  
  const url = window.location.href;
  
  if (url.includes('/recent-activity/') || url.includes('/detail/recent-activity/')) {
    Logger.log('📄 Page d\'activité détectée');
    initActivityFeatures();
  } else if (url.includes('/feed')) {
    Logger.log('📰 Feed principal détecté');
    initFeedFeatures();
  } else if (url.includes('/in/')) {
    Logger.log('👤 Page profil détectée');
    initProfileFeatures();
  }
  
  addBackofficeButton();
}

function initActivityFeatures() {
  // Extraction immédiate
  setTimeout(() => extractPostsHybrid(), 1000);
  
  // Réextraction après scroll
  let lastScrollY = 0;
  let scrollTimeout;
  
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const currentScrollY = window.scrollY;
      if (Math.abs(currentScrollY - lastScrollY) > 300) {
        lastScrollY = currentScrollY;
        extractPostsHybrid();
      }
    }, 500);
  });
}

function initFeedFeatures() {
  Logger.log('Init feed features');
  setTimeout(() => extractPostsHybrid(), 2000);
}

function initProfileFeatures() {
  Logger.log('Init profile features');
  
  // Si c'est notre propre profil, extraire les posts
  const profileId = window.location.pathname.match(/\/in\/([^\/\?]+)/)?.[1];
  if (profileId && linkedinSession.miniProfile?.publicIdentifier === profileId) {
    setTimeout(() => extractPostsHybrid(), 2000);
  }
}

function observeUrlChanges() {
  let lastUrl = window.location.href;
  
  const observer = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      Logger.log('Navigation:', currentUrl);
      setTimeout(() => initFeatures(), 500);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================
// BOUTON FLOTTANT
// ============================================

function addBackofficeButton() {
  const existing = document.getElementById('pp-backoffice-btn');
  if (existing) existing.remove();
  
  const button = document.createElement('button');
  button.id = 'pp-backoffice-btn';
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
    <span>S-Post</span>
  `;
  button.title = 'Ouvrir S-Post Back Office';
  
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    background: linear-gradient(135deg, #0077b5 0%, #00a0dc 100%);
    color: white;
    border: none;
    border-radius: 50px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 119, 181, 0.4);
    transition: all 0.3s ease;
  `;
  
  button.onmouseenter = () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 6px 16px rgba(0, 119, 181, 0.5)';
  };
  
  button.onmouseleave = () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(0, 119, 181, 0.4)';
  };
  
  button.onclick = () => {
    window.open(PP_CONFIG.BACKOFFICE_URL, '_blank');
  };
  
  document.body.appendChild(button);
}

// ============================================
// DÉTECTION AUTOMATIQUE DES STATS DE POST
// ============================================

/**
 * Détecte si on est sur une page de statistiques de post LinkedIn
 * et extrait automatiquement les données
 */
async function detectAndExtractPostStats() {
  const url = window.location.href;
  
  // Détecter les pages de statistiques de post
  // Formats possibles:
  // - /analytics/post-summary/urn:li:activity:XXXXX/
  // - /feed/update/urn:li:activity:XXXXX/analytics/
  // - URL avec "analytics" et un ID d'activité
  const isStatsPage = url.includes('analytics') || 
                      url.includes('post-summary') ||
                      (url.includes('feed/update') && document.body.innerText.includes('Impressions'));
  
  if (!isStatsPage) {
    return;
  }
  
  Logger.log('📊 Page de statistiques détectée ! URL:', url);
  
  // Attendre que la page se charge complètement
  await sleep(2500);
  
  // Extraire l'URN du post depuis l'URL ou la page
  let activityId = null;
  
  // Méthode 1: depuis l'URL
  const urnMatch = url.match(/activity[:\-%3A](\d+)/i);
  if (urnMatch) {
    activityId = urnMatch[1];
  }
  
  // Méthode 2: chercher dans le HTML de la page
  if (!activityId) {
    const htmlMatch = document.body.innerHTML.match(/activity[:\-](\d{18,20})/);
    if (htmlMatch) {
      activityId = htmlMatch[1];
    }
  }
  
  if (!activityId) {
    Logger.warn('URN du post non trouvé');
    return;
  }
  
  const postUrn = `urn:li:activity:${activityId}`;
  Logger.log('📌 Post URN:', postUrn);
  
  // Extraire les stats depuis le texte de la page
  const stats = extractStatsFromPage();
  
  Logger.log('📈 Stats brutes extraites:', stats);
  
  if (stats && Object.values(stats).some(v => v > 0)) {
    Logger.success('✅ Stats extraites automatiquement !');
    Logger.log('   - Impressions:', stats.impressions);
    Logger.log('   - Réactions:', stats.likes);
    Logger.log('   - Commentaires:', stats.comments);
    Logger.log('   - Republications:', stats.shares);
    Logger.log('   - Enregistrements:', stats.saves);
    Logger.log('   - Nouveaux abonnés:', stats.newFollowers);
    
    // Mettre à jour le post dans le storage
    const updated = await updatePostStats(postUrn, stats);
    
    if (updated) {
      // Notification visuelle
      showNotification(`✅ Stats synchronisées !
📊 ${stats.impressions} impressions
❤️ ${stats.likes} réactions
💬 ${stats.comments} commentaires
🔖 ${stats.saves} enregistrements`, 'success', 5000);
    }
  } else {
    Logger.warn('Aucune stat trouvée sur la page. Réessai dans 2s...');
    // Réessayer après un délai (la page peut encore charger)
    setTimeout(() => detectAndExtractPostStats(), 2000);
  }
}

// Observer les changements d'URL (LinkedIn est une SPA)
let lastStatsUrl = location.href;
const statsUrlObserver = new MutationObserver(() => {
  if (location.href !== lastStatsUrl) {
    lastStatsUrl = location.href;
    Logger.log('🔄 Navigation détectée:', location.href.substring(0, 60));
    // Attendre un peu et vérifier si c'est une page de stats
    setTimeout(() => detectAndExtractPostStats(), 1500);
  }
});

// Démarrer l'observation
statsUrlObserver.observe(document.body, { childList: true, subtree: true });

/**
 * Extrait les statistiques depuis le contenu de la page
 */
function extractStatsFromPage() {
  const text = document.body.innerText;
  
  const stats = {
    impressions: 0,
    uniqueViews: 0,
    profileViews: 0,
    newFollowers: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    sends: 0,
    linkClicks: 0,
    engagementRate: 0,
  };
  
  // Patterns améliorés (FR/EN) - inspiré PerfectPost
  const patternsMulti = {
    impressions: [/Impressions?\s*[:\s]*(\d[\d\s,\.]*)/i, /(\d[\d\s,\.]*)\s*impression/i],
    uniqueViews: [/Membres?\s*touchés?\s*[:\s]*(\d[\d\s,\.]*)/i, /Unique\s*views?\s*[:\s]*(\d[\d\s,\.]*)/i],
    profileViews: [/(?:Vues?|Clics?)\s*(?:du|de|sur\s*le?)\s*profil\s*[:\s]*(\d[\d\s,\.]*)/i, /Profile\s*(?:views?|clicks?)\s*[:\s]*(\d[\d\s,\.]*)/i],
    newFollowers: [/Abonnés?\s*(?:acquis|gagnés?)\s*[:\s]*(\d[\d\s,\.]*)/i, /(?:New\s*)?followers?\s*(?:gained)?\s*[:\s]*(\d[\d\s,\.]*)/i],
    likes: [/Réactions?\s*[:\s]*(\d[\d\s,\.]*)/i, /(?:J'aime|Likes?)\s*[:\s]*(\d[\d\s,\.]*)/i, /(\d[\d\s,\.]*)\s*réaction/i],
    comments: [/Commentaires?\s*[:\s]*(\d[\d\s,\.]*)/i, /Comments?\s*[:\s]*(\d[\d\s,\.]*)/i, /(\d[\d\s,\.]*)\s*commentaire/i],
    shares: [/Republications?\s*[:\s]*(\d[\d\s,\.]*)/i, /Partages?\s*[:\s]*(\d[\d\s,\.]*)/i, /Reposts?\s*[:\s]*(\d[\d\s,\.]*)/i],
    saves: [/Enregistrements?\s*[:\s]*(\d[\d\s,\.]*)/i, /Saves?\s*[:\s]*(\d[\d\s,\.]*)/i, /(\d[\d\s,\.]*)\s*enregistrement/i],
    sends: [/Envois?\s*[:\s]*(\d[\d\s,\.]*)/i, /Sends?\s*[:\s]*(\d[\d\s,\.]*)/i],
    linkClicks: [/Clics?\s*(?:sur\s*)?(?:le\s*)?lien\s*[:\s]*(\d[\d\s,\.]*)/i, /Link\s*clicks?\s*[:\s]*(\d[\d\s,\.]*)/i],
    engagementRate: [/Taux\s*d'engagement\s*[:\s]*(\d[\d\s,\.]*)\s*%?/i, /Engagement\s*(?:rate)?\s*[:\s]*(\d[\d\s,\.]*)\s*%?/i],
  };
  
  for (const [key, patterns] of Object.entries(patternsMulti)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const cleanNum = match[1].replace(/[\s,]/g, '').replace(',', '.');
        stats[key] = key === 'engagementRate' ? parseFloat(cleanNum) || 0 : parseInt(cleanNum) || 0;
        break;
      }
    }
  }
  
  // Calculer le taux d'engagement si non trouvé
  if (stats.engagementRate === 0 && stats.impressions > 0) {
    const totalEng = stats.likes + stats.comments + stats.shares + stats.saves;
    stats.engagementRate = Math.round((totalEng / stats.impressions) * 10000) / 100;
  }
  
  Logger.log('📊 Stats page extraites:', stats);
  return stats;
}

/**
 * Met à jour les stats d'un post dans le storage
 */
async function updatePostStats(postUrn, newStats) {
  try {
    // Récupérer les posts existants
    const result = await chrome.storage.local.get('pp_posts');
    const posts = result.pp_posts || [];
    
    // Trouver le post à mettre à jour
    const postIndex = posts.findIndex(p => 
      p.urn === postUrn || 
      p.id === postUrn || 
      p.urn?.includes(postUrn.split(':').pop()) ||
      p.id?.includes(postUrn.split(':').pop())
    );
    
    if (postIndex !== -1) {
      // Mettre à jour les stats (prendre les nouvelles valeurs si > 0, sinon garder les anciennes)
      posts[postIndex].stats = {
        ...posts[postIndex].stats,
        views: newStats.impressions || posts[postIndex].stats?.views || 0,
        uniqueViews: newStats.uniqueViews || posts[postIndex].stats?.uniqueViews || 0,
        likes: newStats.likes || posts[postIndex].stats?.likes || 0,
        comments: newStats.comments || posts[postIndex].stats?.comments || 0,
        shares: newStats.shares || posts[postIndex].stats?.shares || 0,
        saves: newStats.saves || posts[postIndex].stats?.saves || 0,
        sends: newStats.sends || posts[postIndex].stats?.sends || 0,
        profileClicks: newStats.profileViews || posts[postIndex].stats?.profileClicks || 0,
        newFollowers: newStats.newFollowers || posts[postIndex].stats?.newFollowers || 0,
        linkClicks: newStats.linkClicks || posts[postIndex].stats?.linkClicks || 0,
        engagementRate: newStats.engagementRate || posts[postIndex].stats?.engagementRate || 0,
      };
      posts[postIndex].statsUpdatedAt = new Date().toISOString();
      posts[postIndex].statsSource = 'auto_sync'; // Marquer comme sync auto
      
      // Sauvegarder
      await chrome.storage.local.set({ pp_posts: posts });
      Logger.success('Post mis à jour avec les nouvelles stats');
      
      return true;
    } else {
      Logger.warn('Post non trouvé dans le storage, création...');
      
      // Créer un nouveau post avec les stats
      const newPost = {
        id: postUrn,
        urn: postUrn,
        content: '',
        createdAt: null,
        stats: {
          views: newStats.impressions || 0,
          uniqueViews: newStats.uniqueViews || 0,
          likes: newStats.likes || 0,
          comments: newStats.comments || 0,
          shares: newStats.shares || 0,
          saves: newStats.saves || 0,
          sends: newStats.sends || 0,
          profileClicks: newStats.profileViews || 0,
          newFollowers: newStats.newFollowers || 0,
          linkClicks: newStats.linkClicks || 0,
          engagementRate: newStats.engagementRate || 0,
        },
        statsUpdatedAt: new Date().toISOString(),
        statsSource: 'auto_sync',
        source: 'stats_page',
      };
      
      // Extraire la date depuis l'URN
      try {
        const activityId = postUrn.split(':').pop();
        const bigId = BigInt(activityId);
        const timestamp = Number(bigId >> 22n);
        if (timestamp > 1400000000000) {
          newPost.createdAt = new Date(timestamp).toISOString();
        }
      } catch (e) {}
      
      posts.unshift(newPost);
      await chrome.storage.local.set({ pp_posts: posts });
      Logger.success('Nouveau post créé avec les stats');
      
      return true;
    }
  } catch (e) {
    Logger.error('Erreur mise à jour stats:', e);
    return false;
  }
}

// ============================================
// NOTIFICATIONS
// ============================================

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    padding: 12px 24px;
    background: ${type === 'success' ? '#28a745' : '#dc3545'};
    color: white;
    border-radius: 8px;
    font-size: 14px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// STYLES
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

Logger.success('Content script v2.0 chargé - Extraction hybride activée');
