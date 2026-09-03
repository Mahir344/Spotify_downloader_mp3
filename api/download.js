const axios = require('axios');
const yts = require('yt-search');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-spotify-cookie');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Handle full Spotify URL or raw Track ID
    let input = req.query.id || req.query.url;
    if (input && input.includes('/track/')) {
        input = input.split('/track/')[1].split('?')[0];
    }

    const trackId = input;
    const spDcCookie = req.headers['x-spotify-cookie'] || process.env.SPOTIFY_COOKIE || '';

    if (!trackId) {
        return res.status(400).json({ status: 'error', message: 'Spotify Track ID or URL is required.' });
    }

    if (!spDcCookie) {
        return res.status(401).json({ status: 'error', message: 'sp_dc cookie is missing.' });
    }

    try {
        // Browser Headers Simulation (Bypasses 403 Forbidden)
        const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'App-Platform': 'WebPlayer',
            'Spotify-App-Version': '1.2.31.1205.g02927233',
            'Cookie': `sp_dc=${spDcCookie};`
        };

        // Step 1: Request Access Token
        const tokenRes = await axios.get('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
            headers: browserHeaders
        });

        const accessToken = tokenRes.data?.accessToken;

        if (!accessToken) {
            return res.status(403).json({ 
                status: 'error', 
                message: 'Spotify blocked token generation. Update your sp_dc cookie.' 
            });
        }

        // Step 2: Request Track Data with Authorization Bearer Header
        const trackRes = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'User-Agent': browserHeaders['User-Agent']
            }
        });

        const trackData = trackRes.data;
        const songName = trackData.name;
        const artistName = trackData.artists.map(a => a.name).join(', ');

        // Step 3: Search matching audio source via YouTube
        const searchQuery = `${songName} ${artistName}`;
        const ytResults = await yts(searchQuery);
        const topVideo = ytResults.videos[0];

        if (!topVideo) {
            return res.status(404).json({ status: 'error', message: 'No audio source found.' });
        }

        // Output Final Data
        return res.status(200).json({
            status: 'success',
            metadata: {
                id: trackData.id,
                title: songName,
                artist: artistName,
                album: trackData.album.name,
                cover_image: trackData.album.images[0]?.url || null,
                duration: topVideo.timestamp,
                spotify_url: trackData.external_urls.spotify
            },
            download_sources: {
                stream_url: `https://yt.drgn.in/download?id=${topVideo.videoId}&type=audio`,
                direct_mp3_api: `https://api.vevioz.com/api/button/mp3/${topVideo.videoId}`
            }
        });

    } catch (err) {
        return res.status(err.response?.status || 500).json({
            status: 'error',
            http_code: err.response?.status || 500,
            message: err.response?.data?.error?.message || err.message || 'Spotify request forbidden.'
        });
    }
};
