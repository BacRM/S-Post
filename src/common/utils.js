/**
 * PerfectPost - Utilitaires communs
 * Fonctions utilitaires partagées entre les différents scripts
 */

// ============================================
// Manipulation du DOM
// ============================================

/**
 * Attend qu'un élément soit présent dans le DOM
 * @param {string} selector - Sélecteur CSS
 * @param {HTMLElement} parent - Élément parent (défaut: document.body)
 * @param {number} timeout - Timeout en ms (défaut: 10000)
 * @returns {Promise<HTMLElement>}
 */
export function waitForElement(selector, parent = document.body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(parent, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout: élément ${selector} non trouvé`));
    }, timeout);
  });
}

/**
 * Crée un élément HTML avec des attributs
 * @param {string} tag - Nom de la balise
 * @param {Object} attributes - Attributs à ajouter
 * @param {string|HTMLElement|Array} children - Contenu enfant
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, children = null) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  }

  if (children) {
    if (typeof children === 'string') {
      element.textContent = children;
    } else if (children instanceof HTMLElement) {
      element.appendChild(children);
    } else if (Array.isArray(children)) {
      children.forEach((child) => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof HTMLElement) {
          element.appendChild(child);
        }
      });
    }
  }

  return element;
}

// ============================================
// Formatage
// ============================================

/**
 * Formate une date pour l'affichage
 * @param {string|Date} date - Date à formater
 * @param {string} locale - Locale (défaut: 'fr-FR')
 * @returns {string}
 */
export function formatDate(date, locale = 'fr-FR') {
  if (!date) return '-';

  const d = new Date(date);
  const now = new Date();
  const diff = now - d;

  // Moins d'une minute
  if (diff < 60000) {
    return 'À l\'instant';
  }

  // Moins d'une heure
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `Il y a ${minutes} min`;
  }

  // Moins d'un jour
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `Il y a ${hours}h`;
  }

  // Format complet
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formate un nombre avec séparateur de milliers
 * @param {number} num - Nombre à formater
 * @param {string} locale - Locale (défaut: 'fr-FR')
 * @returns {string}
 */
export function formatNumber(num, locale = 'fr-FR') {
  return new Intl.NumberFormat(locale).format(num);
}

/**
 * Tronque un texte à une longueur maximale
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @param {string} suffix - Suffixe (défaut: '...')
 * @returns {string}
 */
export function truncateText(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

// ============================================
// Validation
// ============================================

/**
 * Valide une adresse email
 * @param {string} email - Email à valider
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Valide un mot de passe (min 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre)
 * @param {string} password - Mot de passe à valider
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Au moins 8 caractères');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Au moins une majuscule');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Au moins une minuscule');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Au moins un chiffre');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Storage
// ============================================

/**
 * Récupère une valeur du storage local
 * @param {string|string[]} keys - Clé(s) à récupérer
 * @returns {Promise<Object>}
 */
export async function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

/**
 * Sauvegarde une valeur dans le storage local
 * @param {Object} items - Objet à sauvegarder
 * @returns {Promise<void>}
 */
export async function setInStorage(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

/**
 * Supprime des valeurs du storage local
 * @param {string|string[]} keys - Clé(s) à supprimer
 * @returns {Promise<void>}
 */
export async function removeFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

// ============================================
// Communication
// ============================================

/**
 * Envoie un message au background script
 * @param {Object} message - Message à envoyer
 * @returns {Promise<any>}
 */
export function sendMessage(message) {
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

/**
 * Envoie un message à un onglet spécifique
 * @param {number} tabId - ID de l'onglet
 * @param {Object} message - Message à envoyer
 * @returns {Promise<any>}
 */
export function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// ============================================
// Utilitaires divers
// ============================================

/**
 * Attend un certain temps
 * @param {number} ms - Temps en millisecondes
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce une fonction
 * @param {Function} func - Fonction à debounce
 * @param {number} wait - Temps d'attente en ms
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle une fonction
 * @param {Function} func - Fonction à throttle
 * @param {number} limit - Intervalle minimum en ms
 * @returns {Function}
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Génère un identifiant unique
 * @returns {string}
 */
export function generateId() {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

/**
 * Clone un objet en profondeur
 * @param {Object} obj - Objet à cloner
 * @returns {Object}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Vérifie si un objet est vide
 * @param {Object} obj - Objet à vérifier
 * @returns {boolean}
 */
export function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

