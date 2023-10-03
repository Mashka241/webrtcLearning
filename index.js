(async () => {
    const startCallButton = document.querySelector('button#call');
    const answerButton = document.querySelector('button#answer');
    const hungUpButton = document.querySelector('button#hungup');
    const callButtons = document.querySelector('#callcontrols');
    const toggleVideoButton = document.querySelector('button#videotoggle');
    const remoteVideo = document.querySelector('video#remoteVideo');
    const localVideo = document.querySelector('video#localVideo');
    let localStream;
    let peerConnection;
    let statsGathererInterval;

    let isVideoOn = false;

    answerButton.disabled = true;
    hungUpButton.disabled = true;
    startCallButton.addEventListener('click', startCall);
    answerButton.addEventListener('click', answerCall);
    hungUpButton.addEventListener('click', hungUp);
    toggleVideoButton.addEventListener('click', toggleVideo);

    const bc = new WebSocketSignaling();
    bc.addEventListener('message', (event) => {
        switch (event.data.type) {
            case 'calling':
                answerButton.disabled = false;
                answerButton.classList.add('calling');
                break;
            case 'answering':
                createOffer();
                break;
            case 'candidate':
                handleCandidate(event.data);
                break;
            case 'offer':
                handleOffer(event.data);
                break;
            case 'answer':
                handleAnswer(event.data);
                break;
            case 'hungup':
                answerButton.disabled = true;
                answerButton.classList.remove('calling');
                hungUpButton.disabled = true;
                hungUpButton.classList.remove('hungup');
                startCallButton.disabled = false;
                if (peerConnection) {
                    hungUp();
                }
                break;
            default:
                console.log('default', event.data.type);
        }
    });

    async function createLocalStream() {
        const constraints = { video: false, audio: true };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        window.localMediaStream = localStream;
        console.log('local stream created');
    }

    async function startCall() {
        console.log('start call');
        if (peerConnection) {
            console.log('call already started');
            return;
        }

        await createLocalStream();

        createPeerConnection();

        bc.postMessage({ type: 'calling' });
        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;

        callButtons.classList.remove('invisible');
    }

    async function createOffer() {
        console.log('create offer');
        const offerOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        };
        const offer = await peerConnection.createOffer(offerOptions);
        bc.postMessage({
            type: offer.type,
            sdp: offer.sdp
        });
        await peerConnection.setLocalDescription(offer);
    }

    function displayRecvVideoStats(report) {
        if (report.mediaType === 'video' && report.type === 'inbound-rtp') {
            console.log(`framesPerSecond: ${report?.framesPerSecond}`);
        }
    }

    async function processStats() {
        if (!peerConnection) { return };
        const stats = await peerConnection.getStats(null);

        stats.forEach(report => {
            displayRecvVideoStats(report);
        });
    }

    function createPeerConnection() {
        console.log('createPeerConnection');
        const configuration = {};
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.addEventListener('icecandidate', (e) => {
            const message = {
                type: 'candidate',
                candidate: null,
            };
            if (e.candidate) {
                message.candidate = e.candidate.candidate;
                message.sdpMid = e.candidate.sdpMid;
                message.sdpMLineIndex = e.candidate.sdpMLineIndex;
            };

            bc.postMessage(message);
        });

        peerConnection.addEventListener('track', (event) => {
            const mediaStream = event.streams[0];
            window.remoteMediaStream = mediaStream;
            remoteVideo.srcObject = mediaStream;
        });

        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        statsGathererInterval = setInterval(processStats, 1000);
        console.log('connection created', peerConnection);
    }

    async function handleCandidate(candidate) {
        if (candidate.candidate) {
            peerConnection.addIceCandidate(candidate);
        } else {
            peerConnection.addIceCandidate(null);
        }
    }

    async function answerCall() {
        console.log('answer call');
        answerButton.disabled = true;
        answerButton.classList.remove('calling');
        callButtons.classList.remove('invisible');

        await createLocalStream();

        createPeerConnection();

        bc.postMessage({ type: 'answering' });
        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;
    }

    async function handleOffer(offer) {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        bc.postMessage({
            type: answer.type,
            sdp: answer.sdp
        })
        await peerConnection.setLocalDescription(answer);
    }

    async function handleAnswer(answer) {
        await peerConnection.setRemoteDescription(answer);
    }

    function hungUp() {
        bc.postMessage({ type: 'hungup' });

        if (peerConnection) {
            peerConnection.close();
            peerConnection.getStats().then(report => console.log('stats after closing', report));
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        localVideo.srcObject = null;
        remoteVideo.srcObject = null;

        clearInterval(statsGathererInterval)
    }

    async function toggleVideo() {
        if (isVideoOn) {
            console.log('toggle video OFF');
            // ????
            const videoTracks = stream.getVideoTracks();
            videoTracks.forEach(track => track.stop());
            localStream.removeTrack(videoTracks[0]);
            localVideo.srcObject = null;

            isVideoOn = false;
        } else {
            console.log('toggle video ON');
            const constraints = { video: true, audio: true };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            const videoTracks = stream.getVideoTracks();
            localStream.addTrack(videoTracks[0]);
            localVideo.srcObject = localStream;

            peerConnection.addTrack(videoTracks[0], localStream);
            createOffer();
            isVideoOn = true;
        }
    }
})()