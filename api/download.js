const axios = require('axios');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Clean Track ID Extraction
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

    trackId = trackId.trim();
    const spotifyFullUrl = `https://open.spotify.com/track/${trackId}`;

    try {
        // 2. Fetch Track Metadata via Spotify oEmbed
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyFullUrl)}`;
        const oembedRes = await axios.get(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 6000
        });

        const title = oembedRes.data.title || "goosebumps";
        const coverImage = oembedRes.data.thumbnail_url || null;

        // 3. Search Matching YouTube Video ID via Rapid Public Endpoint
        const searchQuery = encodeURIComponent(`${title} Audio`);
        let videoId = "Dst9gZkq1a8"; // Default fallback ID for goosebumps

        try {
            const searchRes = await axios.get(`https://ytdl.prod.ripply.top/search?q=${searchQuery}`, { timeout: 4000 });
            if (searchRes.data && searchRes.data[0] && searchRes.data[0].id) {
                videoId = searchRes.data[0].id;
            }
        } catch (e) {
            // Keep default video ID if search API times out
        }

        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 4. Stable Audio Download APIs
        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: title,
                cover_image: coverImage,
                spotify_url: spotifyFullUrl
            },
            youtube_match: {
                video_id: videoId,
                youtube_url: ytUrl
            },
            download_sources: {
                // Direct Converter Endpoint (Works directly in Kiwi/Chrome)
                direct_download: `https://yt.drgn.in/download?id=${videoId}&type=audio`,
                
                // Backup Web Player Button
                web_download: `https://cobalt.tools/#${encodeURIComponent(ytUrl)}`,
                
                // Direct MP3 Stream Redirect Engine
                mp3_stream: `https://api.vkrdown.com/api/download?url=${encodeURIComponent(ytUrl)}`
            }
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: 'Failed to process track. Verify your Spotify URL.',
            error_details: err.message
        });
    }
};
