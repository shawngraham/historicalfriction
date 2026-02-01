/**
 * articles.js — Article fetching, filtering, and deduplication
 *
 * Queries GeoNames for nearby Wikipedia articles, checks for images
 * via the Wikipedia API, and maintains a deduplicated collection.
 */

const Articles = (() => {
  const GEONAMES_USER = 'wikimedia';
  const DEFAULT_RADIUS_KM = 10;
  const PAGE_SIZE = 25;

  // Map of articleUrl → article object
  const _seen = new Map();

  // Current filter keyword (set via voice commands)
  let _filterKeyword = '';

  /**
   * Fetch nearby Wikipedia articles from GeoNames.
   * @param {number} lat
   * @param {number} lon
   * @param {number} [radiusKm]
   * @returns {Promise<Array>} array of article objects
   */
  async function fetchNearby(lat, lon, radiusKm = DEFAULT_RADIUS_KM) {
    const url = `https://secure.geonames.org/findNearbyWikipediaJSON?lat=${lat}&lng=${lon}&radius=${radiusKm}&username=${GEONAMES_USER}&maxRows=${PAGE_SIZE}`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`GeoNames request failed: ${resp.status}`);

    const data = await resp.json();
    if (!data.geonames) return [];

    const newArticles = [];

    for (const raw of data.geonames) {
      const articleUrl = `https://${raw.wikipediaUrl}`;
      if (_seen.has(articleUrl)) continue;

      const article = {
        title: raw.title,
        summary: raw.summary || '',
        url: articleUrl,
        distance: raw.distance ? parseFloat(raw.distance) : null,
        lat: raw.lat,
        lon: raw.lng,
        hasImage: null, // checked later
        sounding: false,
      };

      _seen.set(articleUrl, article);
      newArticles.push(article);
    }

    // Check images for new articles in the background
    if (newArticles.length > 0) {
      _checkImages(newArticles);
    }

    return newArticles;
  }

  /**
   * Check Wikipedia for images on a batch of articles.
   * Updates each article's hasImage property in place.
   */
  async function _checkImages(articles) {
    // Build a single batched query with all titles
    const titles = articles.map(a => a.title).join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=images&format=json&origin=*&titles=${encodeURIComponent(titles)}&imlimit=500`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json();

      // Build a title→hasImages map from the response
      const imageMap = new Map();
      if (data.query && data.query.pages) {
        for (const page of Object.values(data.query.pages)) {
          const has = Array.isArray(page.images) && page.images.length > 0;
          imageMap.set(page.title, has);
        }
      }

      for (const article of articles) {
        article.hasImage = imageMap.get(article.title) ?? false;
      }
    } catch (e) {
      console.warn('Image check failed:', e);
    }
  }

  /**
   * Get all articles, optionally filtered by the current keyword.
   * @returns {Array}
   */
  function getAll() {
    let list = Array.from(_seen.values());
    if (_filterKeyword) {
      const kw = _filterKeyword.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(kw) ||
        a.summary.toLowerCase().includes(kw)
      );
    }
    return list;
  }

  /**
   * Get the closest article.
   * @returns {object|null}
   */
  function getClosest() {
    const all = getAll();
    if (all.length === 0) return null;
    return all.reduce((closest, a) =>
      (a.distance !== null && (closest.distance === null || a.distance < closest.distance)) ? a : closest
    );
  }

  /**
   * Set a keyword filter. Pass empty string to clear.
   */
  function setFilter(keyword) {
    _filterKeyword = (keyword || '').trim();
  }

  function getFilter() {
    return _filterKeyword;
  }

  /**
   * Clear all articles and state.
   */
  function clear() {
    _seen.clear();
    _filterKeyword = '';
  }

  /**
   * Total count of all (unfiltered) articles.
   */
  function totalCount() {
    return _seen.size;
  }

  return {
    fetchNearby,
    getAll,
    getClosest,
    setFilter,
    getFilter,
    clear,
    totalCount,
    DEFAULT_RADIUS_KM,
  };
})();
