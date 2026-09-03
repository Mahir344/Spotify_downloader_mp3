const axios = require('axios');

module.exports = async (req, res) => {
    // CORS Header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Check if this request is a DIRECT DOWNLOAD TRIGGER
    const streamSource = req.query.stream_source;
    const downloadFileName = req.query.filename || 'music.mp3';

    if (streamSource) {
        try {
            // Fetch audio stream from external CDN
            const audioStream = await axios({
                method: 'get',
                url: streamSource,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            // Force Chrome to download file directly
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
            
            // Pipe audio stream directly to browser response
            return audioStream.data.pipe(res);
        } catch (e) {
            // If proxy stream fails, fallback to direct redirect
            return res.redirect(streamSource);
        }
    }

    // 2. Normal API Request (Extract Spotify Metadata)
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
        // Fetch Spotify Metadata
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyFullUrl)}`;
        const oembedRes = await axios.get(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 6000
        });

        const title = oembedRes.data.title || "goosebumps";
        const coverImage = oembedRes.data.thumbnail_url || null;

        // Extract Video ID
        const searchQuery = encodeURIComponent(`${title} Audio`);
        let videoId = "Dst9gZkq1a8";

        try {
            const searchRes = await axios.get(`https://ytdl.prod.ripply.top/search?q=${searchQuery}`, { timeout: 4000 });
            if (searchRes.data && searchRes.data[0] && searchRes.data[0].id) {
                videoId = searchRes.data[0].id;
            }
        } catch (e) {
            // Keep fallback ID
        }

        const rawAudioSource = `https://yt.drgn.in/download?id=${videoId}&type=audio`;
        const fileName = `${title.replace(/[^a-zA-Z0-9\s]/g, "")}.mp3`;
        
        // Host Domain Protocol logic
        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        
        // Direct Download Trigger Link (Your API itself handles Chrome Force Download)
        const directDownloadUrl = `${protocol}://${host}/api/download?stream_source=${encodeURIComponent(rawAudioSource)}&filename=${encodeURIComponent(fileName)}`;

        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: title,
                cover_image: coverImage,
                spotify_url: spotifyFullUrl
            },
            download_sources: {
                // 🚀 THIS LINK WILL INSTANTLY START DOWNLOAD IN CHROME
                direct_chrome_download: directDownloadUrl
            }
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: 'Failed to process request.',
            error_details: err.message
        });
    }
};
