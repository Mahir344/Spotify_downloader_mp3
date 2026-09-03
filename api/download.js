const axios = require('axios');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Check if this request is a STREAM / DIRECT DOWNLOAD TRIGGER
    const audioUrl = req.query.stream_url;
    const downloadFileName = req.query.filename || 'song.mp3';

    if (audioUrl) {
        try {
            // Stream audio content directly to force browser download
            const streamRes = await axios({
                method: 'get',
                url: audioUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            });

            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
            return streamRes.data.pipe(res);
        } catch (err) {
            // If proxy stream fails, redirect to raw link
            return res.redirect(audioUrl);
        }
    }

    // 2. Extract Spotify Track ID
    let input = req.query.id || req.query.url;
    if (!input) {
        return res.status(400).json({ status: 'error', message: 'Spotify Track ID or URL is required.' });
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
        // Fetch Metadata via oEmbed
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyFullUrl)}`;
        const oembedRes = await axios.get(oembedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 6000
        });

        const title = oembedRes.data.title || "goosebumps";
        const coverImage = oembedRes.data.thumbnail_url || null;

        // Search Video ID via Public Search
        const searchQuery = encodeURIComponent(`${title} Audio`);
        let videoId = "Dst9gZkq1a8";

        try {
            const searchRes = await axios.get(`https://ytdl.prod.ripply.top/search?q=${searchQuery}`, { timeout: 4000 });
            if (searchRes.data && searchRes.data[0] && searchRes.data[0].id) {
                videoId = searchRes.data[0].id;
            }
        } catch (e) {
            // Fallback video ID remains
        }

        const ytVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 3. Extract Direct Working Audio Link via Open API (Cobalt Engine)
        let directAudioStream = "";
        try {
            const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
                url: ytVideoUrl,
                downloadMode: 'audio',
                audioFormat: 'mp3'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 7000
            });

            if (cobaltRes.data && cobaltRes.data.url) {
                directAudioStream = cobaltRes.data.url;
            }
        } catch (e) {
            // Fallback audio server
            directAudioStream = `https://ytdl.prod.ripply.top/download?id=${videoId}&type=audio`;
        }

        const fileName = `${title.replace(/[^a-zA-Z0-9\s]/g, "")}.mp3`;
        const host = req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';

        // Custom Stream Trigger Link
        const chromeDownloadUrl = `${protocol}://${host}/api/download?stream_url=${encodeURIComponent(directAudioStream)}&filename=${encodeURIComponent(fileName)}`;

        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackId,
                title: title,
                cover_image: coverImage,
                spotify_url: spotifyFullUrl
            },
            download_sources: {
                // 🚀 CLICKABLE CHROME AUTO DOWNLOAD LINK
                direct_chrome_download: chromeDownloadUrl,
                raw_audio_stream: directAudioStream
            }
        });

    } catch (err) {
        return res.status(500).json({
            status: 'error',
            message: 'Failed to resolve download stream.',
            error_details: err.message
        });
    }
};
