const axios = require('axios');
const yts = require('yt-search');

module.exports = async (req, res) => {
    // CORS Header Enable
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Spotify Link or Track ID Handler
    let input = req.query.id || req.query.url;
    if (!input) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Spotify Track ID or URL is required. Example: ?id=4cOdK2wGLETKBW3PvgPWqT' 
        });
    }

    if (input.includes('/track/')) {
        input = input.split('/track/')[1].split('?')[0];
    }

    const trackId = input;

    try {
        // 2. Public Spotify Embed Web Scraping (Bypasses 403 IP Blocks & Needs No Cookie)
        const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
        const embedRes = await axios.get(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        const html = embedRes.data;

        // 3. Extract Embedded JSON State Data
        const match = html.match(/<script id="resource" type="application\/json">(.*?)<\/script>/s);
        
        let title = "";
        let artist = "";
        let coverImage = "";

        if (match && match[1]) {
            const trackJson = JSON.parse(match[1]);
            title = trackJson.title || "";
            artist = trackJson.artists ? trackJson.artists.map(a => a.name).join(', ') : "";
            coverImage = trackJson.coverArt?.sources[0]?.url || "";
        } else {
            // Regex Fallback Extraction
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                const fullTitle = titleMatch[1].replace(' - song and lyrics by ', ' | ').replace(' | Spotify', '');
                const parts = fullTitle.split(' | ');
                title = parts[0] || "Unknown Title";
                artist = parts[1] || "Unknown Artist";
            }
        }

        if (!title) {
            return res.status(404).json({ status: 'error', message: 'Could not fetch track info. Check the Spotify URL.' });
        }

        // 4. Search Audio Match on YouTube
        const searchQuery = `${title} ${artist}`;
        const ytResults = await yts(searchQuery);
        const topVideo = ytResults.videos[0];

        if (!topVideo) {
            return res.status(404).json({ status: 'error', message: 'No audio source match found.' });
        }

        // 5. Success JSON Response Output
        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: title,
                artist: artist,
                cover_image: coverImage,
                duration: topVideo.timestamp,
                spotify_url: `https://open.spotify.com/track/${trackId}`
            },
            youtube_match: {
                title: topVideo.title,
                url: topVideo.url
            },
            download_sources: {
                stream_url: `https://yt.drgn.in/download?id=${topVideo.videoId}&type=audio`,
                direct_mp3_api: `https://api.vevioz.com/api/button/mp3/${topVideo.videoId}`
            }
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: err.message || 'Failed to resolve Spotify stream.'
        });
    }
};

