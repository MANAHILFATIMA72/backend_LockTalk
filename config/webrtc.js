// WebRTC Configuration for LockTalk Calling Module

const getICEServers = () => {
    const iceServersEnv = process.env.ICE_SERVERS || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"

    const servers = iceServersEnv
        .split(",")
        .map((server) => {
            const [protocol, address] = server.split(":")

            if (protocol === "stun") {
                return {
                    urls: [`stun:${address}`],
                }
            } else if (protocol === "turn") {
                return {
                    urls: [`turn:${address}`],
                    username: process.env.TURN_USERNAME || "",
                    credential: process.env.TURN_PASSWORD || "",
                }
            }

            return null
        })
        .filter(Boolean)

    return servers
}

const webrtcConfig = {
    // ICE Servers for NAT traversal
    iceServers: getICEServers(),

    // DTLS Configuration
    dtls: {
        enabled: true,
        version: "1.2",
        cipherSuites: [
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
        ],
    },

    // SRTP Configuration
    srtp: {
        enabled: true,
        profile: "SRTP_AES128_CM_SHA1_80",
        keyDerivationFunction: "PRKDF2",
    },

    // Media Constraints
    mediaConstraints: {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            typingNoiseDetection: true,
        },
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
        },
    },

    // Connection Timeouts
    timeouts: {
        iceGatheringTimeout: 5000,
        connectionTimeout: 10000,
        callTimeout: 60000,
    },

    // Codec Preferences
    codecs: {
        audio: ["opus", "pcmu", "pcma"],
        video: ["vp9", "vp8", "h264"],
    },
}

module.exports = webrtcConfig
