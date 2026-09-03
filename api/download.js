const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Enable
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Extract and Clean Track ID
    let input = req.query.id || req.query.url;
    if (!input) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Spotify Track ID or URL is required.' 
        });
    }

    let trackId = input;
    const match = input.match(/track\/([a-zA-Z0-9]{22})/);
    if (match && match[1]) {
        trackId = match[1];
    } else if (input.includes('?')) {
        trackId = input.split('?')[0];
    }

    // Clean Track ID check (Spotify IDs are exactly 22 alphanumeric chars)
    trackId = trackId.trim();
    const spotifyFullUrl = `https://open.spotify.com/track/${trackId}`;

    try {
        // 2. Fetch Track Metadata via Spotify oEmbed Endpoint
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyFullUrl)}`;
        const oembedRes = await axios.get(oembedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 8000 // 8 second timeout safeguard
        });

        const data = oembedRes.data;
        const fullTitle = data.title || "Unknown Track";
        const coverImage = data.thumbnail_url || null;

        // 3. Search Matching Audio Source via Invidious / Public Search Proxy
        const searchQuery = encodeURIComponent(`${fullTitle} Audio`);
        const searchRes = await axios.get(`https://api.vkrdown.com/api/search?q=${searchQuery}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        }).catch(() => null);

        let videoId = null;
        if (searchRes && searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {
            videoId = searchRes.data.data[0].id || searchRes.data.data[0].videoId;
        }

        // Fallback search mechanism if search API fails
        const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;

        // 4. Send Success Response
        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: fullTitle,
                cover_image: coverImage,
                spotify_url: spotifyFullUrl
            },
            download_sources: {
                stream_url: videoId ? `https://yt.drgn.in/download?id=${videoId}&type=audio` : null,
                direct_mp3_api: videoId ? `https://api.vevioz.com/api/button/mp3/${videoId}` : `https://api.vevioz.com/api/button/mp3/search?q=${searchQuery}`,
                cobalt_api: "https://api.cobalt.tools/api/json"
            }
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: 'Failed to fetch Spotify track. Check if the ID is correct.',
            provided_id: trackId,
            error_details: err.message
        });
    }
};
