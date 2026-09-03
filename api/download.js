const axios = require('axios');

module.exports = async (req, res) => {
    // =========================
    // CORS
    // =========================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // =========================================================
    // 1. REAL DOWNLOAD PROXY
    // /api/download?stream_url=...&filename=song.mp3
    // =========================================================
    const audioUrl = req.query.stream_url;
    const requestedFileName = req.query.filename || 'song.mp3';

    if (audioUrl) {
        try {
            // Basic URL validation
            let parsedUrl;

            try {
                parsedUrl = new URL(audioUrl);
            } catch (e) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid stream URL.'
                });
            }

            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Only HTTP/HTTPS stream URLs are allowed.'
                });
            }

            // Clean filename
            const safeFileName =
                String(requestedFileName)
                    .replace(/[\r\n"]/g, '')
                    .replace(/[<>:"/\\|?*]/g, '')
                    .trim() || 'song.mp3';

            const response = await axios({
                method: 'GET',
                url: audioUrl,
                responseType: 'stream',

                timeout: 30000,

                maxRedirects: 5,

                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
                    'Accept':
                        'audio/mpeg,audio/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5',
                    'Referer': 'https://www.youtube.com/'
                },

                validateStatus: (status) => {
                    return status >= 200 && status < 300;
                }
            });

            // Upstream content type
            const contentType =
                response.headers['content-type'] ||
                'audio/mpeg';

            // Upstream file size, if available
            const contentLength =
                response.headers['content-length'];

            // IMPORTANT:
            // Force browser download
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${safeFileName}"`
            );

            res.setHeader('Content-Type', contentType);

            if (contentLength) {
                res.setHeader('Content-Length', contentLength);
            }

            // Prevent caching
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');

            // Stream directly to browser
            response.data.pipe(res);

            response.data.on('error', (streamError) => {
                console.error('Audio stream error:', streamError);

                if (!res.headersSent) {
                    res.status(502).json({
                        status: 'error',
                        message: 'Audio stream failed.'
                    });
                } else {
                    res.end();
                }
            });

            return;
        } catch (err) {
            console.error('Download proxy error:', err.message);

            return res.status(502).json({
                status: 'error',
                message: 'Unable to download the audio file.',
                error: err.message
            });
        }
    }

    // =========================================================
    // 2. GET SPOTIFY TRACK ID
    // =========================================================
    let input = req.query.id || req.query.url;

    if (!input) {
        return res.status(400).json({
            status: 'error',
            message: 'Spotify Track ID or URL is required.'
        });
    }

    input = String(input).trim();

    let trackId = input;

    // Spotify URL
    const match = input.match(
        /spotify\.com\/track\/([a-zA-Z0-9]{22})/
    );

    if (match && match[1]) {
        trackId = match[1];
    } else {
        // Remove query parameters
        trackId = input.split('?')[0].trim();
    }

    // Validate Spotify ID
    if (!/^[a-zA-Z0-9]{22}$/.test(trackId)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid Spotify Track ID.'
        });
    }

    const spotifyFullUrl =
        `https://open.spotify.com/track/${trackId}`;

    try {
        // =====================================================
        // 3. SPOTIFY METADATA
        // =====================================================
        const oembedUrl =
            `https://open.spotify.com/oembed?url=${encodeURIComponent(
                spotifyFullUrl
            )}`;

        const oembedRes = await axios.get(oembedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 10000
        });

        const title =
            oembedRes.data?.title || 'song';

        const coverImage =
            oembedRes.data?.thumbnail_url || null;

        // =====================================================
        // 4. SEARCH YOUTUBE VIDEO
        // =====================================================
        let videoId = null;

        try {
            const searchQuery =
                encodeURIComponent(`${title} Audio`);

            const searchRes = await axios.get(
                `https://ytdl.prod.ripply.top/search?q=${searchQuery}`,
                {
                    timeout: 8000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );

            if (
                Array.isArray(searchRes.data) &&
                searchRes.data.length > 0 &&
                searchRes.data[0]?.id
            ) {
                videoId = searchRes.data[0].id;
            }
        } catch (searchError) {
            console.error(
                'YouTube search failed:',
                searchError.message
            );
        }

        if (!videoId) {
            return res.status(404).json({
                status: 'error',
                message: 'Could not find an audio source.'
            });
        }

        const ytVideoUrl =
            `https://www.youtube.com/watch?v=${videoId}`;

        // =====================================================
        // 5. GET AUDIO URL
        // =====================================================
        let directAudioStream = '';

        try {
            const cobaltRes = await axios.post(
                'https://api.cobalt.tools/api/json',
                {
                    url: ytVideoUrl,
                    downloadMode: 'audio',
                    audioFormat: 'mp3'
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                }
            );

            if (
                cobaltRes.data &&
                typeof cobaltRes.data.url === 'string'
            ) {
                directAudioStream = cobaltRes.data.url;
            }
        } catch (cobaltError) {
            console.error(
                'Cobalt failed:',
                cobaltError.message
            );
        }

        // Fallback source
        if (!directAudioStream) {
            directAudioStream =
                `https://ytdl.prod.ripply.top/download?id=${encodeURIComponent(
                    videoId
                )}&type=audio`;
        }

        // =====================================================
        // 6. CREATE YOUR OWN DOWNLOAD URL
        // =====================================================
        const fileName =
            `${title
                .replace(/[<>:"/\\|?*]/g, '')
                .replace(/[^\w\s.-]/g, '')
                .trim() || 'song'}.mp3`;

        const host = req.headers.host;

        const protocol =
            req.headers['x-forwarded-proto'] || 'https';

        const downloadUrl =
            `${protocol}://${host}/api/download` +
            `?stream_url=${encodeURIComponent(directAudioStream)}` +
            `&filename=${encodeURIComponent(fileName)}`;

        // =====================================================
        // 7. RESPONSE
        // =====================================================
        return res.status(200).json({
            status: 'success',

            metadata: {
                id: trackId,
                title: title,
                cover_image: coverImage,
                spotify_url: spotifyFullUrl
            },

            download_sources: {
                direct_download: downloadUrl,
                raw_audio_stream: directAudioStream
            }
        });

    } catch (err) {
        console.error(
            'Spotify resolver error:',
            err.message
        );

        return res.status(500).json({
            status: 'error',
            message: 'Failed to resolve download stream.',
            error_details: err.message
        });
    }
};
