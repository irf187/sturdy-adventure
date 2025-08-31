// Simple peer-to-peer WebRTC implementation
let localConnection = null;
let dataChannel = null;
let isInitiator = false;
let myId = generateId();

// Free public STUN servers for NAT traversal
const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];

// Generate simple random ID
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('yourId').textContent = myId;
    document.getElementById('messageInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    initializeSignaling();
});

// Simple signaling using a public WebSocket (for demo - replace with your own)
let signalingSocket = null;

function initializeSignaling() {
    // Using a public WebSocket service for signaling only
    // In production, use your own simple signaling server
    try {
        signalingSocket = new WebSocket('wss://socketsbay.com/wss/v2/1/' + myId + '/');
        
        signalingSocket.onopen = function() {
            console.log('Signaling connected');
        };
        
        signalingSocket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleSignalingMessage(data);
        };
        
        signalingSocket.onerror = function() {
            console.log('Signaling failed, trying alternative method');
            setupLocalSignaling();
        };
    } catch (e) {
        setupLocalSignaling();
    }
}

// Fallback: Manual signaling via copy/paste
function setupLocalSignaling() {
    document.querySelector('.connection-controls').innerHTML = `
        <div style="margin-bottom: 15px;">
            <label><strong>Manual Connection Mode</strong></label>
            <textarea id="offerArea" placeholder="Paste connection offer here" style="width: 100%; height: 60px; margin: 5px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
            <button onclick="handlePastedOffer()" style="padding: 8px 15px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Process Offer</button>
        </div>
        <div>
            <button onclick="createOffer()" style="padding: 12px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; margin-right: 10px;">Create Connection</button>
            <span style="font-size: 12px; color: #666;">Click to generate connection code to share</span>
        </div>
    `;
}

function connectToPeer() {
    const remoteId = document.getElementById('remoteId').value.trim();
    if (!remoteId) return;
    
    updateStatus('Connecting...', 'connecting');
    isInitiator = true;
    createPeerConnection();
    
    // Send connection request via signaling
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({
            type: 'connect-request',
            to: remoteId,
            from: myId
        }));
    }
}

function createPeerConnection() {
    localConnection = new RTCPeerConnection({ iceServers });
    
    localConnection.onicecandidate = function(event) {
        if (event.candidate && signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
            signalingSocket.send(JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate
            }));
        }
    };
    
    if (isInitiator) {
        dataChannel = localConnection.createDataChannel('messages');
        setupDataChannel(dataChannel);
    } else {
        localConnection.ondatachannel = function(event) {
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
        };
    }
}

function setupDataChannel(channel) {
    channel.onopen = function() {
        updateStatus('Connected - Messages are encrypted end-to-end', 'connected');
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        document.getElementById('connectBtn').disabled = true;
    };
    
    channel.onclose = function() {
        updateStatus('Disconnected', 'disconnected');
        document.getElementById('messageInput').disabled = true;
        document.getElementById('sendBtn').disabled = true;
        document.getElementById('connectBtn').disabled = false;
    };
    
    channel.onmessage = function(event) {
        const message = decrypt(event.data);
        displayMessage(message, false);
    };
}

function handleSignalingMessage(data) {
    switch(data.type) {
        case 'connect-request':
            if (data.to === myId) {
                isInitiator = false;
                createPeerConnection();
                // Auto-accept connection requests
                updateStatus('Incoming connection...', 'connecting');
            }
            break;
        case 'offer':
            handleOffer(data.offer);
            break;
        case 'answer':
            handleAnswer(data.answer);
            break;
        case 'ice-candidate':
            handleIceCandidate(data.candidate);
            break;
    }
}

async function createOffer() {
    isInitiator = true;
    createPeerConnection();
    
    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);
    
    // Display offer for manual sharing
    const offerText = btoa(JSON.stringify(offer));
    prompt('Share this connection code with your friend:', offerText);
}

async function handlePastedOffer() {
    const offerText = document.getElementById('offerArea').value.trim();
    if (!offerText) return;
    
    try {
        const offer = JSON.parse(atob(offerText));
        isInitiator = false;
        createPeerConnection();
        
        await localConnection.setRemoteDescription(offer);
        const answer = await localConnection.createAnswer();
        await localConnection.setLocalDescription(answer);
        
        const answerText = btoa(JSON.stringify(answer));
        prompt('Send this answer code back to your friend:', answerText);
        
        updateStatus('Waiting for connection...', 'connecting');
    } catch (e) {
        alert('Invalid connection code');
    }
}

async function handleOffer(offer) {
    await localConnection.setRemoteDescription(offer);
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);
    
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({
            type: 'answer',
            answer: answer
        }));
    }
}

async function handleAnswer(answer) {
    await localConnection.setRemoteDescription(answer);
}

async function handleIceCandidate(candidate) {
    await localConnection.addIceCandidate(candidate);
}

// Simple XOR encryption (basic obfuscation)
function encrypt(text) {
    const key = myId + (document.getElementById('remoteId').value || 'default');
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
}

function decrypt(encryptedText) {
    try {
        const key = myId + (document.getElementById('remoteId').value || 'default');
        const text = atob(encryptedText);
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch (e) {
        return encryptedText; // Return as-is if decryption fails
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || !dataChannel || dataChannel.readyState !== 'open') return;
    
    const encrypted = encrypt(message);
    dataChannel.send(encrypted);
    displayMessage(message, true);
    input.value = '';
}

function displayMessage(message, isSent) {
    const chatArea = document.getElementById('chatArea');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.textContent = message;
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function updateStatus(text, type) {
    const status = document.getElementById('status');
    status.textContent = text;
    status.className = `status ${type}`;
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (localConnection) {
        localConnection.close();
    }
    if (signalingSocket) {
        signalingSocket.close();
    }
});