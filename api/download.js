const axios = require('axios');
const yts = require('yt-search');

module.exports = async (req, res) => {
    // CORS Headers Enable
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Spotify URL / Track ID Extraction
    let input = req.query.id || req.query.url;
    if (!input) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Spotify Track ID or URL is required. Example: ?id=4cOdK2wGLETKBW3PvgPWqT' 
        });
    }

    let trackId = input;
    if (input.includes('/track/')) {
        trackId = input.split('/track/')[1].split('?')[0];
    }

    const spotifyFullUrl = `https://open.spotify.com/track/${trackId}`;

    try {
        // 2. Fetch Metadata using Official Spotify oEmbed Endpoint (100% Stable)
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyFullUrl)}`;
        const oembedRes = await axios.get(oembedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        const data = oembedRes.data;

        // Extract Title and Artist from oEmbed response
        const title = data.title || "Unknown Track";
        const coverImage = data.thumbnail_url || null;

        if (!title) {
            return res.status(404).json({ status: 'error', message: 'Could not fetch track metadata.' });
        }

        // 3. Search Matching Audio Stream via YouTube
        const searchQuery = `${title} Audio`;
        const ytResults = await yts(searchQuery);
        const topVideo = ytResults.videos[0];

        if (!topVideo) {
            return res.status(404).json({ status: 'error', message: 'No matching audio source found on YouTube.' });
        }

        // 4. Output Clean & Working Response
        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: title,
                cover_image: coverImage,
                duration: topVideo.timestamp,
                spotify_url: spotifyFullUrl
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
            message: err.message || 'Failed to fetch track details. Ensure the Spotify track link is valid.'
        });
    }
};
